/**
 * Contrôleur de delete.php : confirmation, puis suppression du message, ou de toute la discussion
 * s'il l'ouvre (delete_post() / delete_topic() et update_forum()).
 */

import type { EditablePost } from '../domain/models.ts';
import type { AppReply, AppRequest } from '../http/context.ts';
import type { FormBody } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildDeletePage } from '../presenters/deletePage.ts';
import type { CensorReader } from '../repositories/CensorRepository.ts';
import type { PostEditStore } from '../repositories/PostEditRepository.ts';
import { buildCensor } from '../services/censor.ts';
import { canDeletePost, ownershipOf } from '../services/permissions.ts';
import { positiveInt } from './params.ts';

export interface DeleteControllerDeps extends LayoutDeps {
	postEdits: PostEditStore;
	censorship: CensorReader;
}

export interface DeleteQuery {
	id?: string;
}

type DeleteRequest = AppRequest<{ Querystring: DeleteQuery; Body?: FormBody }>;

export class DeleteController {
	constructor(private readonly deps: DeleteControllerDeps) {}

	show = async (request: AppRequest<{ Querystring: DeleteQuery }>, reply: AppReply): Promise<AppReply> => {
		const post = await this.resolvePost(request, reply);
		if (!('topic' in post)) return post;
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;

		const view = buildDeletePage({
			viewer,
			config,
			post,
			censor: config.censoring ? buildCensor(await this.deps.censorship.listWords()) : null,
			lang,
			dateWords: this.deps.page.dateWords,
			now: this.deps.page.clock(),
		});
		return renderPage(
			request,
			reply,
			this.deps,
			'delete.njk',
			{ pageId: 'delete', titleParts: [config.boardTitle, lang.delete.deletePost], activeNav: 'index' },
			view,
		);
	};

	confirm = async (request: AppRequest<{ Querystring: DeleteQuery; Body: FormBody }>, reply: AppReply): Promise<AppReply> => {
		const post = await this.resolvePost(request, reply);
		if (!('topic' in post)) return post;
		// Comme le PHP, il faut le bouton « Supprimer » : sinon on réaffiche la confirmation.
		if (request.body.delete === undefined) return this.show(request, reply);

		if (post.id === post.topic.firstPostId) {
			await this.deps.postEdits.deleteTopic(post);
			return reply.redirect(`viewforum.php?id=${post.forum.id}`);
		}
		const previous = await this.deps.postEdits.deletePost(post);
		return reply.redirect(previous !== null ? `viewtopic.php?pid=${previous}#p${previous}` : `viewtopic.php?id=${post.topic.id}`);
	};

	private async resolvePost(request: DeleteRequest, reply: AppReply): Promise<EditablePost | AppReply> {
		const { viewer } = request;
		const { lang } = this.deps.page;
		if (!viewer.group.canReadBoard) return renderMessage(request, reply, this.deps, 403, lang.common.noView);

		const id = positiveInt(request.query.id);
		const post = id > 0 ? await this.deps.postEdits.findPost(id, viewer.group.id) : null;
		if (post === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
		if (!canDeletePost(viewer, ownershipOf(post))) return renderMessage(request, reply, this.deps, 403, lang.common.noPermission);
		return post;
	}
}
