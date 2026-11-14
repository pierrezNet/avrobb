/**
 * react.php : « J'aime » ou réaction d'un membre sur un message. Formulaire sans JavaScript (retour
 * au message), ou réponse JSON (barre recalculée) pour reactions.js.
 * reactions.php : membres ayant réagi à un message, par « J'aime » ou par réaction.
 */

import type { AppReply, AppRequest } from '../http/context.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildReactionsPage, reactionsView } from '../presenters/reactions.ts';
import type { AvatarLocator } from '../repositories/AvatarFiles.ts';
import type { PostEditStore } from '../repositories/PostEditRepository.ts';
import type { PostReactionReader, PostReactionWriter } from '../repositories/PostReactionRepository.ts';
import { pageCount } from '../services/pagination.ts';
import {
	canReact,
	NO_REACTIONS,
	nextReaction,
	type PostReactions,
	type ReactionChoice,
	reactionEnabled,
	readReactionChoice,
} from '../services/reactions.ts';
import { positiveInt } from './params.ts';

export interface ReactionControllerDeps extends LayoutDeps {
	postEdits: Pick<PostEditStore, 'findPost'>;
	postReactions: PostReactionReader & PostReactionWriter;
	avatars: AvatarLocator;
}

export interface ReactionsQuery {
	pid?: string;
	r?: string;
	p?: string;
}

const REACTORS_PER_PAGE = 50;

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
		return reply.header('cache-control', 'no-store').json(reactionsView(postId, post.posterId, counts, { viewer, config, lang }));
	};

	show = async (request: AppRequest<{ Querystring: ReactionsQuery }>, reply: AppReply): Promise<AppReply> => {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		if (!viewer.group.canReadBoard) return renderMessage(request, reply, this.deps, 403, lang.common.noView);
		const postId = positiveInt(request.query.pid);
		const filter = request.query.r !== undefined ? readReactionChoice(request.query.r) : null;
		if (postId === 0 || (request.query.r !== undefined && filter === null) || (!config.postLikes && !config.postReactions))
			return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
		const post = await this.deps.postEdits.findPost(postId, viewer.group.id);
		if (post === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);

		const counts = (await this.deps.postReactions.forPosts([postId], viewer.id)).get(postId) ?? NO_REACTIONS;
		const numPages = pageCount(filteredCount(counts, filter), REACTORS_PER_PAGE);
		const requested = positiveInt(request.query.p);
		const page = requested >= 1 && requested <= numPages ? requested : 1;
		const reactors = await this.deps.postReactions.listReactors(postId, filter, (page - 1) * REACTORS_PER_PAGE, REACTORS_PER_PAGE);
		const avatarUrls = config.avatars
			? await Promise.all(reactors.map((reactor) => this.deps.avatars.urlFor(reactor.userId, config.avatarsDir)))
			: [];
		const view = buildReactionsPage({
			viewer,
			config,
			lang,
			post: { id: post.id, poster: post.poster },
			counts,
			filter,
			reactors,
			avatars: new Map(reactors.map((reactor, index) => [reactor.userId, avatarUrls[index] ?? null])),
			page,
			numPages,
			dateWords: this.deps.page.dateWords,
			now: this.deps.page.clock(),
		});
		return renderPage(
			request,
			reply,
			this.deps,
			'reactions.njk',
			{ pageId: 'reactions', titleParts: [view.title, config.boardTitle], pageNumber: page > 1 ? page : null },
			view,
		);
	};
}

function filteredCount(counts: PostReactions, filter: ReactionChoice | null): number {
	if (filter === null) return counts.reactors;
	return filter.kind === 'like' ? counts.likes : (counts.reactions[filter.reaction] ?? 0);
}
