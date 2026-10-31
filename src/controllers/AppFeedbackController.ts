/**
 * Retours d'une application source (Phraséo, Donne Ton Point : formulaire « J'ai un retour », sans
 * compte), reçus de son relais par liaison de service (worker.ts, PhraseoFeedback et
 * DonneTonPointFeedback) et non par une adresse publique.
 *
 * Chaque retour devient un sujet du forum privé « à trier » de l'application, signé par son compte
 * système (migrations 0005 et 0008). Le contact de l'auteur n'est jamais publié : il part seulement
 * par e-mail à la liste d'administration, avec le lien du sujet. Pas de requête HTTP ici, comme
 * ScheduledTasks.
 */

import type { Mailer } from '../adapters/mailer.ts';
import type { FeedbackSourceId } from '../domain/models.ts';
import type { Logger } from '../http/context.ts';
import type { ConfigReader } from '../repositories/ConfigLoader.ts';
import type { PostingStore } from '../repositories/PostingRepository.ts';
import type { StopwordsReader } from '../repositories/StopwordsLoader.ts';
import { appFeedbackMessage, appFeedbackSubject, FEEDBACK_SOURCES, type FeedbackTexts, parseAppFeedback } from '../services/appFeedback.ts';
import { fillTemplate, type MailTemplateReader } from '../services/mail.ts';
import { absoluteUrl, postPath } from '../services/routes.ts';
import { indexWords } from '../services/searchIndex.ts';

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
}

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

		const subject = appFeedbackSubject(feedback, texts);
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
		return { ok: true, topicId };
	}
}
