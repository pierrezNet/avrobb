/**
 * Contrôleur de viewtopic : lit la requête, interroge les repositories, délègue la mise en forme
 * au presenter et choisit la réponse (vue, redirection ou message d'erreur). Pas de SQL ni de HTML ici.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildTopicPage, topicUrl } from '../presenters/topicPage.ts';
import type { BanReader } from '../repositories/BanRepository.ts';
import type { CensorReader } from '../repositories/CensorRepository.ts';
import type { PostReader } from '../repositories/PostRepository.ts';
import type { TopicLabelReader } from '../repositories/TopicLabelRepository.ts';
import type { TopicReader } from '../repositories/TopicRepository.ts';
import type { AvatarLocator } from '../services/avatars.ts';
import { buildCensor } from '../services/censor.ts';
import { clampPage, pageCount } from '../services/pagination.ts';
import { positiveInt } from './params.ts';

export interface TopicControllerDeps extends LayoutDeps {
	topics: TopicReader;
	posts: PostReader;
	avatars: AvatarLocator;
	bans: BanReader;
	censorship: CensorReader;
	topicLabels: TopicLabelReader;
}

export interface TopicQuery {
	id?: string;
	pid?: string;
	p?: string;
	action?: string;
}

export class TopicController {
	constructor(private readonly deps: TopicControllerDeps) {}

	show = async (request: FastifyRequest<{ Querystring: TopicQuery }>, reply: FastifyReply): Promise<FastifyReply> => {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;

		if (!viewer.group.canReadBoard) return renderMessage(request, reply, this.deps, 403, lang.common.noView);

		const id = positiveInt(request.query.id);
		const pid = positiveInt(request.query.pid);
		const perPage = viewer.postsPerPage ?? config.defaultPostsPerPage;

		// viewtopic.php?pid=N : on renvoie vers la page du sujet qui contient le message.
		if (pid > 0) return this.redirectToPost(request, reply, pid, perPage);

		if (id === 0) return this.notFound(request, reply);

		// action=new demande le suivi des sujets lus (cookie PHP) : non repris, on va au dernier message.
		if (request.query.action === 'last' || request.query.action === 'new') {
			const lastPostId = await this.deps.topics.findLastPostId(id);
			if (lastPostId !== null) return reply.redirect(`viewtopic.php?pid=${lastPostId}#p${lastPostId}`);
		}

		const topic = await this.deps.topics.findReadable(id, viewer.group.id);
		if (topic === null) return this.notFound(request, reply);

		const numPages = pageCount(topic.numReplies + 1, perPage);
		const page = clampPage(request.query.p, numPages);
		const offset = (page - 1) * perPage;

		const [posts, labels, bannedUsernames, censoredWords] = await Promise.all([
			this.deps.posts.listPage(topic.id, offset, perPage),
			this.deps.topicLabels.listForTopics([topic.id]),
			this.deps.bans.listBannedUsernames(),
			config.censoring ? this.deps.censorship.listWords() : [],
		]);

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
			labels: labels.get(topic.id) ?? [],
			posts,
			page,
			numPages,
			firstPosition: offset + 1,
			avatars,
			bannedUsernames,
			censor: config.censoring ? buildCensor(censoredWords) : null,
			lang,
			dateWords: this.deps.page.dateWords,
			now: this.deps.page.clock(),
		});

		return renderPage(
			request,
			reply,
			this.deps,
			'viewtopic.njk',
			{
				pageId: 'viewtopic',
				titleParts: [config.boardTitle, topic.forum.name, view.topic.subject],
				pageNumber: page,
				activeNav: 'index',
				footer: { kind: 'viewtopic', topic, page },
				allowIndex: true,
				canonicalUrl: topicUrl(topic.id, page),
			},
			view,
		);
	};

	private async redirectToPost(request: FastifyRequest, reply: FastifyReply, pid: number, perPage: number): Promise<FastifyReply> {
		const location = await this.deps.topics.locatePost(pid);

		if (location === null) return this.notFound(request, reply);

		const page = Math.ceil(location.position / perPage);
		const pageParam = page > 1 ? `&p=${page}` : '';
		return reply.redirect(`viewtopic.php?id=${location.topicId}${pageParam}#p${pid}`);
	}

	private notFound(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
		return renderMessage(request, reply, this.deps, 404, this.deps.page.lang.common.badRequest);
	}
}
