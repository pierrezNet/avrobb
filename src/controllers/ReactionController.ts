/**
 * react.php : « J'aime » ou réaction d'un membre sur un message. Formulaire sans JavaScript (retour
 * au message), ou réponse JSON des compteurs pour reactions.js.
 */

import type { AppReply, AppRequest } from '../http/context.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage } from '../http/layout.ts';
import type { PostEditStore } from '../repositories/PostEditRepository.ts';
import type { PostReactionReader, PostReactionWriter } from '../repositories/PostReactionRepository.ts';
import { canReact, NO_REACTIONS, nextReaction, reactionEnabled, readReactionChoice } from '../services/reactions.ts';
import { positiveInt } from './params.ts';

export interface ReactionControllerDeps extends LayoutDeps {
	postEdits: Pick<PostEditStore, 'findPost'>;
	postReactions: PostReactionReader & PostReactionWriter;
}

export class ReactionController {
	constructor(private readonly deps: ReactionControllerDeps) {}

	submit = async (request: AppRequest<{ Body: FormBody }>, reply: AppReply): Promise<AppReply> => {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		const postId = positiveInt(field(request.body, 'pid'));
		const choice = readReactionChoice(field(request.body, 'value'));
		if (choice === null || postId === 0 || !reactionEnabled(config, choice))
			return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
		const post = await this.deps.postEdits.findPost(postId, viewer.group.id);
		if (post === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
		if (!canReact(viewer, post.posterId)) return renderMessage(request, reply, this.deps, 403, lang.common.noPermission);

		const current = (await this.deps.postReactions.forPosts([postId], viewer.id)).get(postId) ?? NO_REACTIONS;
		await this.deps.postReactions.save(postId, viewer.id, nextReaction(current, choice), this.deps.page.clock());
		if (!(request.headers.accept ?? '').includes('application/json')) return reply.redirect(`viewtopic.php?pid=${postId}#p${postId}`);
		const counts = (await this.deps.postReactions.forPosts([postId], viewer.id)).get(postId) ?? NO_REACTIONS;
		return reply.header('cache-control', 'no-store').json(counts);
	};
}
