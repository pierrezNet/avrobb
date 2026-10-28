/**
 * Contrôleur de viewtopic : lit la requête, interroge les repositories, délègue la mise en forme
 * au presenter et choisit la réponse (vue, redirection ou message d'erreur). Pas de SQL ni de HTML ici.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { LegacyCookieConfig } from '../config.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { setForumCookie } from '../http/session.ts';
import { buildTopicPage, topicUrl } from '../presenters/topicPage.ts';
import type { BanReader } from '../repositories/BanRepository.ts';
import type { CensorReader } from '../repositories/CensorRepository.ts';
import type { PostReader } from '../repositories/PostRepository.ts';
import type { ToolbarReader } from '../repositories/ToolbarRepository.ts';
import type { TopicLabelReader } from '../repositories/TopicLabelRepository.ts';
import type { TopicReader, TopicWriter } from '../repositories/TopicRepository.ts';
import type { AvatarLocator } from '../services/avatars.ts';
import { buildCensor } from '../services/censor.ts';
import { clampPage, pageCount } from '../services/pagination.ts';
import { isForumModerator } from '../services/permissions.ts';
import { DEFAULT_TOOLBAR } from '../services/toolbar.ts';
import { markRead, parseTrackedTopics, serializeTrackedTopics } from '../services/trackedTopics.ts';
import { positiveInt } from './params.ts';

export interface TopicControllerDeps extends LayoutDeps {
	topics: TopicReader;
	posts: PostReader;
	avatars: AvatarLocator;
	bans: BanReader;
	censorship: CensorReader;
	topicLabels: TopicLabelReader;
	topicViews: TopicWriter;
	toolbar: ToolbarReader;
	legacyCookie: LegacyCookieConfig;
	trackCookieName: string;
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

		// action=new : premier message non lu (d'après le cookie de suivi ou la dernière visite), sinon le dernier.
		if (request.query.action === 'new') {
			if (!viewer.isGuest) {
				const tracked = parseTrackedTopics(request.cookies[this.deps.trackCookieName]);
				const firstNew = await this.deps.topics.findFirstPostAfter(id, tracked.topics.get(id) ?? viewer.lastVisit);
				if (firstNew !== null) return reply.redirect(`viewtopic.php?pid=${firstNew}#p${firstNew}`);
			}
			return reply.redirect(`viewtopic.php?id=${id}&action=last`);
		}

		if (request.query.action === 'last') {
			const lastPostId = await this.deps.topics.findLastPostId(id);
			if (lastPostId !== null) return reply.redirect(`viewtopic.php?pid=${lastPostId}#p${lastPostId}`);
		}

		const topic = await this.deps.topics.findReadable(id, viewer.group.id, viewer.id);
		if (topic === null) return this.notFound(request, reply);

		const numPages = pageCount(topic.numReplies + 1, perPage);
		const page = clampPage(request.query.p, numPages);
		const offset = (page - 1) * perPage;

		const [posts, labels, labelDefinitions, bannedUsernames, censoredWords, toolbar] = await Promise.all([
			this.deps.posts.listPage(topic.id, offset, perPage),
			this.deps.topicLabels.listForTopics([topic.id]),
			// Balises proposées dans le pied de page : seulement pour les modérateurs du forum.
			isForumModerator(viewer, topic.forum) ? this.deps.topicLabels.listDefinitions() : [],
			this.deps.bans.listBannedUsernames(),
			config.censoring ? this.deps.censorship.listWords() : [],
			this.deps.toolbar.load(),
		]);

		const avatars = new Map<number, string | null>();
		if (config.avatars && viewer.showAvatars) {
			for (const post of posts) {
				if (post.author !== null && !avatars.has(post.author.id))
					avatars.set(post.author.id, await this.deps.avatars.urlFor(post.author.id, config.avatarsDir));
			}
		}

		await this.recordVisit(request, reply, topic.id);

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
			toolbar: toolbar ?? DEFAULT_TOOLBAR,
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
				footer: { kind: 'viewtopic', topic, page, labelDefinitions, appliedLabels: labels.get(topic.id) ?? [] },
				allowIndex: true,
				canonicalUrl: topicUrl(topic.id, page),
			},
			view,
		);
	};

	/**
	 * Effets de l'affichage d'un sujet, comme viewtopic.php : sujet marqué lu dans le cookie de suivi
	 * (membres), puis compteur de vues (o_topic_views). Seules écritures faites sur un GET, comme
	 * dans tout forum : elles ne dépendent d'aucune action du visiteur.
	 */
	private async recordVisit(request: FastifyRequest, reply: FastifyReply, topicId: number): Promise<void> {
		const { viewer, board: config } = request;
		const now = this.deps.page.clock();

		if (!viewer.isGuest) {
			const tracked = markRead(parseTrackedTopics(request.cookies[this.deps.trackCookieName]), 'topics', topicId, now);
			setForumCookie(
				reply,
				this.deps.legacyCookie,
				this.deps.trackCookieName,
				serializeTrackedTopics(tracked),
				now + config.timeoutVisit,
				now,
				config.timeoutVisit,
			);
		}

		if (config.topicViews) await this.deps.topicViews.incrementViews(topicId);
	}

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
