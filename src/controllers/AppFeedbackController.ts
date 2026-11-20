/**
 * Retours d'une application source (Phraséo, Donne Ton Point : formulaire « J'ai un retour », sans
 * compte), reçus de son relais par liaison de service (worker.ts, PhraseoFeedback et
 * DonneTonPointFeedback) et non par une adresse publique.
 *
 * Chaque retour devient un sujet du forum privé « à trier » de l'application, signé par son compte
 * système (migrations 0005 et 0008). Le contact de l'auteur n'est jamais publié : il part seulement
 * par e-mail à la liste d'administration, avec le lien du sujet. Pas de requête HTTP ici, comme
 * ScheduledTasks.
 *
 * Le sujet est créé avec le début du message ; un modèle de langue (Workers AI) propose ensuite un
 * titre, puis le message et le titre sont traduits, en arrière-plan : le relais n'attend pas le
 * modèle. Sans réponse, le sujet reste tel quel et la tâche horaire rattrape la traduction.
 */

import type { Mailer } from '../adapters/mailer.ts';
import type { TextModel } from '../adapters/textModel.ts';
import type { FeedbackSourceId } from '../domain/models.ts';
import type { Logger } from '../http/context.ts';
import type { ConfigReader } from '../repositories/ConfigLoader.ts';
import type { PostEditStore } from '../repositories/PostEditRepository.ts';
import type { PostingStore } from '../repositories/PostingRepository.ts';
import type { StopwordsReader } from '../repositories/StopwordsLoader.ts';
import {
	type AppFeedback,
	appFeedbackMessage,
	appFeedbackSubject,
	FEEDBACK_SOURCES,
	type FeedbackTexts,
	feedbackTitleInstructions,
	parseAppFeedback,
	parseFeedbackTitle,
} from '../services/appFeedback.ts';
import { fillTemplate, type MailTemplateReader } from '../services/mail.ts';
import { absoluteUrl, postPath } from '../services/routes.ts';
import { indexWords } from '../services/searchIndex.ts';
import { type TranslationJobDeps, translateSources } from './translationJob.ts';

export interface AppFeedbackDeps {
	config: ConfigReader;
	posting: Pick<PostingStore, 'createTopic'>;
	stopwords: StopwordsReader;
	mailer: Mailer;
	mailTemplates: MailTemplateReader;
	/** Textes de toutes les applications (lang/fr/appFeedback.ts). */
	texts: Readonly<Record<FeedbackSourceId, FeedbackTexts>>;
	clock: () => number;
	logger: Logger;
	/** Titre proposé par un modèle de langue et traduction, après la réponse au relais ; null sans Workers AI. */
	ai: {
		model: TextModel;
		postEdits: Pick<PostEditStore, 'updatePost'>;
		translation: TranslationJobDeps;
		background: (task: Promise<unknown>) => void;
	} | null;
}

/** Début du message envoyé au modèle : de quoi titrer, sans dépenser pour un long texte. */
const TITLE_SOURCE_LENGTH = 2000;

/** Réponse au relais : sujet créé, retour refusé (format) ou fonction non configurée (migration absente). */
export type AppFeedbackResult = { ok: true; topicId: number } | { ok: false; reason: 'invalid' | 'disabled' };

export class AppFeedbackController {
	constructor(
		private readonly sourceId: FeedbackSourceId,
		private readonly deps: AppFeedbackDeps,
	) {}

	async submit(input: unknown): Promise<AppFeedbackResult> {
		const { deps } = this;
		const source = FEEDBACK_SOURCES[this.sourceId];
		const texts = deps.texts[this.sourceId];
		const config = await deps.config.load();
		const destination = config.appFeedback[this.sourceId];
		if (destination === null) return { ok: false, reason: 'disabled' };

		const feedback = parseAppFeedback(source, input);
		if (feedback === null) return { ok: false, reason: 'invalid' };

		const subject = appFeedbackSubject(feedback, texts, config.subjectTags);
		const message = appFeedbackMessage(feedback, texts);
		const stopwords = await deps.stopwords.load();
		const { topicId, postId } = await deps.posting.createTopic({
			author: { kind: 'member', id: destination.userId, username: texts.authorName, promoteTo: null },
			// Aucune adresse de l'auteur conservée : le relais ne la transmet pas.
			ip: '',
			message,
			hideSmilies: true,
			now: deps.clock(),
			words: indexWords(message, subject, stopwords),
			forumId: destination.forumId,
			subject,
			sticky: false,
			subscribe: false,
		});

		if (config.registration.mailingList !== '') {
			const template = await deps.mailTemplates.load(source.mailTemplate);
			const values = {
				app: texts.appName,
				type: feedback.type,
				pseudo: feedback.pseudo === '' ? texts.anonymous : feedback.pseudo,
				contact: feedback.contact === '' ? texts.noContact : feedback.contact,
				post_url: absoluteUrl(config.baseUrl, postPath(postId)),
				board_mailer: config.boardTitle,
			};
			try {
				await deps.mailer.send(
					{
						to: config.registration.mailingList,
						subject: fillTemplate(template.subject, values),
						text: fillTemplate(template.body, values),
					},
					config,
				);
			} catch (error) {
				// Le sujet existe : un e-mail perdu ne fait pas échouer le retour (il reste à trier dans le forum).
				deps.logger.error({ err: error, topicId, source: this.sourceId }, "Échec de l'e-mail d'un retour d'application");
			}
		}
		const { ai } = deps;
		if (ai !== null)
			ai.background(
				this.retitle(ai, feedback, texts, config.subjectTags, { topicId, postId, message }).then((title) =>
					translateSources(ai.translation, [
						{ kind: 'post', id: postId, text: message },
						{ kind: 'subject', id: topicId, text: title ?? subject },
					]),
				),
			);
		return { ok: true, topicId };
	}

	/** Remplace le début du message par le titre du modèle (modification silencieuse, réindexée) ; renvoie le sujet, ou null. */
	private async retitle(
		title: NonNullable<AppFeedbackDeps['ai']>,
		feedback: AppFeedback,
		texts: FeedbackTexts,
		tags: Parameters<typeof appFeedbackSubject>[2],
		created: { topicId: number; postId: number; message: string },
	): Promise<string | null> {
		try {
			const reply = await title.model.complete(
				feedbackTitleInstructions(texts.appName),
				feedback.message.slice(0, TITLE_SOURCE_LENGTH),
				60,
			);
			const proposed = reply !== null ? parseFeedbackTitle(reply) : null;
			if (proposed === null) return null;
			const subject = appFeedbackSubject(feedback, texts, tags, proposed);
			await title.postEdits.updatePost({
				postId: created.postId,
				topicId: created.topicId,
				message: created.message,
				hideSmilies: true,
				edited: null,
				topic: { subject, sticky: false },
				words: indexWords(created.message, subject, await this.deps.stopwords.load()),
			});
			return subject;
		} catch (error) {
			this.deps.logger.error({ err: error, topicId: created.topicId, source: this.sourceId }, "Échec du titre d'un retour d'application");
			return null;
		}
	}
}
