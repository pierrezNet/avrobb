/**
 * « Accepter » un retour de l'application Phraséo (POST phraseo_accept.php?id=…, jeton CSRF vérifié
 * en amont) : le sujet quitte le forum privé « à trier » pour le forum public configuré
 * (o_phraseo_feedback_target), après remplacement du rappel d'en-tête du premier message.
 *
 * Deux lots successifs (message puis déplacement) : D1 n'a pas de transaction interactive et ces
 * écritures vivent dans deux repositories. Un échec entre les deux laisse un état sans danger : sujet
 * resté privé avec le nouvel en-tête, qu'un second clic publie.
 */

import type { AppReply, AppRequest } from '../http/context.ts';
import type { FormBody } from '../http/forms.ts';
import { type LayoutDeps, renderMessage } from '../http/layout.ts';
import type { ModerationStore } from '../repositories/ModerationRepository.ts';
import type { PostEditStore } from '../repositories/PostEditRepository.ts';
import type { StopwordsReader } from '../repositories/StopwordsLoader.ts';
import { canAcceptPhraseoFeedback } from '../services/permissions.ts';
import { publicPhraseoFeedbackMessage } from '../services/phraseoFeedback.ts';
import { indexWords } from '../services/searchIndex.ts';
import { positiveInt } from './params.ts';

export interface PhraseoAcceptDeps extends LayoutDeps {
	moderation: Pick<ModerationStore, 'findTopic' | 'moveTopics'>;
	postEdits: Pick<PostEditStore, 'findPost' | 'updatePost'>;
	stopwords: StopwordsReader;
}

export interface PhraseoAcceptQuery {
	id?: string;
}

export class PhraseoAcceptController {
	constructor(private readonly deps: PhraseoAcceptDeps) {}

	accept = async (request: AppRequest<{ Querystring: PhraseoAcceptQuery; Body: FormBody }>, reply: AppReply): Promise<AppReply> => {
		const { deps } = this;
		const { viewer, board: config } = request;
		const { lang } = deps.page;
		const topicId = positiveInt(request.query.id);
		const feedback = config.phraseoFeedback;
		if (topicId === null || feedback === null || feedback.targetForumId === null)
			return renderMessage(request, reply, deps, 400, lang.common.badRequest);
		if (!canAcceptPhraseoFeedback(viewer, feedback.forumId, config))
			return renderMessage(request, reply, deps, 403, lang.common.noPermission);

		// Le sujet doit être dans le forum privé « à trier » (sinon : déjà accepté, ou autre sujet)
		const topic = await deps.moderation.findTopic(topicId, feedback.forumId, viewer.group.id);
		if (topic === null) return renderMessage(request, reply, deps, 404, lang.common.badRequest);

		const post = await deps.postEdits.findPost(topic.firstPostId, viewer.group.id);
		if (post !== null) {
			const message = publicPhraseoFeedbackMessage(post.message, lang.phraseoFeedback);
			if (message !== post.message) {
				const stopwords = await deps.stopwords.load();
				await deps.postEdits.updatePost({
					postId: post.id,
					topicId: topic.id,
					message,
					hideSmilies: post.hideSmilies,
					// Modification silencieuse : pas de mention « modifié par » sur un retour publié tel quel
					edited: null,
					topic: null,
					words: indexWords(message, topic.subject, stopwords),
				});
			}
		}

		const moved = await deps.moderation.moveTopics(feedback.forumId, [topic.id], feedback.targetForumId, false, viewer.group.id);
		if (!moved) return renderMessage(request, reply, deps, 409, lang.common.badRequest);
		return reply.redirect(`viewtopic.php?id=${topic.id}`, 303);
	};
}
