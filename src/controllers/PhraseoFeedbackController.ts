/**
 * Retours de l'application Phraséo (formulaire « J'ai un retour », sans compte), reçus du relais de
 * Phraséo par liaison de service (worker.ts, PhraseoFeedback) et non par une adresse publique.
 *
 * Chaque retour devient un sujet du forum privé « à trier », signé par le compte système de la
 * migration 0005. Le contact de l'auteur n'est jamais publié : il part seulement par e-mail à la liste
 * d'administration, avec le lien du sujet. Pas de requête HTTP ici, comme ScheduledTasks.
 */

import type { Mailer } from '../adapters/mailer.ts';
import type { Logger } from '../http/context.ts';
import type { phraseoFeedback as phraseoFeedbackTexts } from '../lang/fr/phraseoFeedback.ts';
import type { ConfigReader } from '../repositories/ConfigLoader.ts';
import type { PostingStore } from '../repositories/PostingRepository.ts';
import type { StopwordsReader } from '../repositories/StopwordsLoader.ts';
import { fillTemplate, type MailTemplateReader } from '../services/mail.ts';
import { parsePhraseoFeedback, phraseoFeedbackMessage, phraseoFeedbackSubject } from '../services/phraseoFeedback.ts';
import { absoluteUrl, postPath } from '../services/routes.ts';
import { indexWords } from '../services/searchIndex.ts';

export interface PhraseoFeedbackDeps {
	config: ConfigReader;
	posting: Pick<PostingStore, 'createTopic'>;
	stopwords: StopwordsReader;
	mailer: Mailer;
	mailTemplates: MailTemplateReader;
	texts: typeof phraseoFeedbackTexts;
	clock: () => number;
	logger: Logger;
}

/** Réponse au relais : sujet créé, retour refusé (format) ou fonction non configurée (migration absente). */
export type PhraseoFeedbackResult = { ok: true; topicId: number } | { ok: false; reason: 'invalid' | 'disabled' };

export class PhraseoFeedbackController {
	constructor(private readonly deps: PhraseoFeedbackDeps) {}

	async submit(input: unknown): Promise<PhraseoFeedbackResult> {
		const { deps } = this;
		const config = await deps.config.load();
		const destination = config.phraseoFeedback;
		if (destination === null) return { ok: false, reason: 'disabled' };

		const feedback = parsePhraseoFeedback(input);
		if (feedback === null) return { ok: false, reason: 'invalid' };

		const subject = phraseoFeedbackSubject(feedback, deps.texts);
		const message = phraseoFeedbackMessage(feedback, deps.texts);
		const stopwords = await deps.stopwords.load();
		const { topicId, postId } = await deps.posting.createTopic({
			author: { kind: 'member', id: destination.userId, username: deps.texts.authorName, promoteTo: null },
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
			const template = await deps.mailTemplates.load('phraseo_feedback');
			try {
				await deps.mailer.send(
					{
						to: config.registration.mailingList,
						subject: fillTemplate(template.subject, { type: feedback.type }),
						text: fillTemplate(template.body, {
							type: feedback.type,
							pseudo: feedback.pseudo === '' ? deps.texts.anonymous : feedback.pseudo,
							contact: feedback.contact === '' ? deps.texts.noContact : feedback.contact,
							post_url: absoluteUrl(config.baseUrl, postPath(postId)),
							board_mailer: config.boardTitle,
						}),
					},
					config,
				);
			} catch (error) {
				// Le sujet existe : un e-mail perdu ne fait pas échouer le retour (il reste à trier dans le forum).
				deps.logger.error({ err: error, topicId }, "Échec de l'e-mail d'un retour Phraséo");
			}
		}
		return { ok: true, topicId };
	}
}
