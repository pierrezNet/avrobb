/**
 * Contrôleur de viewtopic : lit la requête, interroge les repositories, délègue la mise en forme
 * au presenter et choisit la réponse (vue, redirection ou message d'erreur). Pas de SQL ni de HTML ici.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { BoardConfig } from '../domain/models.ts';
import { layoutContext, type PageContext, renderMessage } from '../http/layout.ts';
import { buildTopicPage } from '../presenters/topicPage.ts';
import type { ConfigReader } from '../repositories/ConfigRepository.ts';
import type { PostReader } from '../repositories/PostRepository.ts';
import type { TopicReader } from '../repositories/TopicRepository.ts';
import type { AvatarLocator } from '../services/avatars.ts';
import { clampPage, pageCount } from '../services/pagination.ts';

export interface TopicControllerDeps {
	config: ConfigReader;
	topics: TopicReader;
	posts: PostReader;
	avatars: AvatarLocator;
	page: PageContext;
}

interface TopicQuery {
	id?: string;
	pid?: string;
	p?: string;
	action?: string;
}

const positiveInt = (value: string | undefined): number => {
	const n = Number.parseInt(value ?? '', 10);
	return Number.isNaN(n) || n < 1 ? 0 : n;
};

export class TopicController {
	constructor(private readonly deps: TopicControllerDeps) {}

	show = async (request: FastifyRequest<{ Querystring: TopicQuery }>, reply: FastifyReply): Promise<unknown> => {
		const { viewer } = request;
		const config = await this.deps.config.load();

		if (!viewer.group.canReadBoard) return renderMessage(reply, 403, this.deps.page.lang.noView, viewer, config, this.deps.page);

		const id = positiveInt(request.query.id);
		const pid = positiveInt(request.query.pid);

		// viewtopic.php?pid=N : on renvoie vers la page du sujet qui contient le message.
		if (pid > 0) return this.redirectToPost(reply, pid, viewer.postsPerPage ?? config.defaultPostsPerPage, config);

		if (id === 0) return this.notFound(reply, request, config);

		// action=new demande le suivi des sujets lus (cookie PHP) : non repris, on va au dernier message.
		if (request.query.action === 'last' || request.query.action === 'new') {
			const lastPostId = await this.deps.topics.findLastPostId(id);
			if (lastPostId !== null) return reply.redirect(`viewtopic.php?pid=${lastPostId}#p${lastPostId}`);
		}

		const topic = await this.deps.topics.findReadable(id, viewer.group.id);
		if (topic === null) return this.notFound(reply, request, config);

		const perPage = viewer.postsPerPage ?? config.defaultPostsPerPage;
		const numPages = pageCount(topic.numReplies + 1, perPage);
		const page = clampPage(request.query.p, numPages);
		const offset = (page - 1) * perPage;

		const posts = await this.deps.posts.listPage(topic.id, offset, perPage);

		const avatars = new Map<number, string | null>();
		if (config.avatars && viewer.showAvatars) {
			for (const post of posts) {
				if (post.author !== null && !avatars.has(post.author.id))
					avatars.set(post.author.id, await this.deps.avatars.urlFor(post.author.id, config.avatarsDir));
			}
		}

		const view = buildTopicPage({
			viewer,
			config,
			topic,
			posts,
			page,
			numPages,
			firstPosition: offset + 1,
			avatars,
			lang: this.deps.page.lang,
			dateWords: this.deps.page.dateWords,
			now: this.deps.page.clock(),
		});

		return reply.view('viewtopic.njk', {
			...layoutContext(viewer, config, this.deps.page, 'viewtopic', [config.boardTitle, topic.forum.name, topic.subject]),
			view,
		});
	};

	private async redirectToPost(reply: FastifyReply, pid: number, perPage: number, config: BoardConfig): Promise<FastifyReply> {
		const location = await this.deps.topics.locatePost(pid);

		if (location === null) return renderMessage(reply, 404, this.deps.page.lang.badRequest, reply.request.viewer, config, this.deps.page);

		const page = Math.ceil(location.position / perPage);
		const pageParam = page > 1 ? `&p=${page}` : '';
		return reply.redirect(`viewtopic.php?id=${location.topicId}${pageParam}#p${pid}`);
	}

	private notFound(reply: FastifyReply, request: FastifyRequest, config: BoardConfig): FastifyReply {
		return renderMessage(reply, 404, this.deps.page.lang.badRequest, request.viewer, config, this.deps.page);
	}
}
