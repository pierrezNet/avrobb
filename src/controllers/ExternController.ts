/**
 * Contrôleur d'extern.php : flux RSS, Atom, XML ou liste HTML des discussions récentes ou d'une
 * discussion, et fragments HTML « membres en ligne » et « statistiques » pour d'autres sites.
 *
 * Écarts assumés : pas d'authentification HTTP Basic (lot Authentification) ni de cache des flux
 * dans cache/ (o_feed_ttl, qui écrirait des fichiers PHP).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { LayoutDeps } from '../http/layout.ts';
import { buildTopicFeed, buildTopicsFeed, type FeedInput } from '../presenters/feed.ts';
import type { CensorReader } from '../repositories/CensorRepository.ts';
import type { FeedReader } from '../repositories/FeedRepository.ts';
import type { StatsReader } from '../repositories/StatsRepository.ts';
import type { UsersInfoReader } from '../repositories/UsersInfoLoader.ts';
import { escapeHtml } from '../services/bbcode.ts';
import { buildCensor } from '../services/censor.ts';
import { type Feed, renderAtom, renderHtmlList, renderRss, renderXml } from '../services/feeds.ts';
import { forumNumberFormat } from '../services/numberFormat.ts';

export interface ExternControllerDeps extends LayoutDeps {
	feeds: FeedReader;
	stats: StatsReader;
	usersInfo: UsersInfoReader;
	censorship: CensorReader;
}

export interface ExternQuery {
	action?: string;
	type?: string;
	show?: string;
	tid?: string;
	fid?: string;
	nfid?: string;
	order?: string;
}

type FeedType = 'html' | 'rss' | 'atom' | 'xml';

const CONTENT_TYPES: Record<FeedType, string> = {
	html: 'text/html; charset=utf-8',
	rss: 'application/xml; charset=utf-8',
	atom: 'application/atom+xml; charset=utf-8',
	xml: 'application/xml; charset=utf-8',
};

/** Liste d'identifiants « 1,2,3 » (intval() de chaque élément, comme le PHP). */
const idList = (value: string | undefined): number[] =>
	(value ?? '')
		.split(',')
		.map((part) => Number.parseInt(part.trim(), 10))
		.filter((id) => Number.isSafeInteger(id) && id > 0);

export class ExternController {
	constructor(private readonly deps: ExternControllerDeps) {}

	show = async (request: FastifyRequest<{ Querystring: ExternQuery }>, reply: FastifyReply): Promise<FastifyReply> => {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;

		if (!viewer.group.canReadBoard)
			return reply
				.code(401)
				.header('WWW-Authenticate', `Basic realm="${config.boardTitle} External Syndication"`)
				.type('text/plain; charset=utf-8')
				.send(lang.common.noView);

		let action = (request.query.action ?? 'feed').toLowerCase();
		let order = request.query.order;
		// Anciens formats de FluxBB 1.2.
		if (action === 'active') [action, order] = ['feed', 'last_post'];
		else if (action === 'new') [action, order] = ['feed', 'posted'];

		if (action === 'feed') return this.feed(request, reply, order?.toLowerCase() === 'posted');
		if (action === 'online' || action === 'online_full') return this.online(request, reply, action === 'online_full');
		if (action === 'stats') return this.stats(request, reply);

		return reply.type('text/plain; charset=utf-8').send(lang.common.badRequest);
	};

	private async feed(
		request: FastifyRequest<{ Querystring: ExternQuery }>,
		reply: FastifyReply,
		orderPosted: boolean,
	): Promise<FastifyReply> {
		const { viewer, board: config } = request;
		const { query } = request;
		const requested = (query.type ?? 'html').toLowerCase();
		const type: FeedType = requested === 'rss' || requested === 'atom' || requested === 'xml' ? requested : 'html';
		const show = Number.parseInt(query.show ?? '15', 10);
		const limit = Number.isSafeInteger(show) && show >= 1 && show <= 50 ? show : 15;
		const input: FeedInput = {
			viewer,
			config,
			censor: config.censoring ? buildCensor(await this.deps.censorship.listWords()) : null,
			lang: this.deps.page.lang,
		};

		let feed: Feed;
		if (query.tid !== undefined) {
			const topicId = Number.parseInt(query.tid, 10) || 0;
			const topic = await this.deps.feeds.findTopic(topicId, viewer.group.id);
			if (topic === null) return reply.type('text/plain; charset=utf-8').send(this.deps.page.lang.common.badRequest);
			feed = buildTopicFeed({ id: topicId, ...topic }, await this.deps.feeds.listTopicPosts(topicId, limit), input);
		} else {
			const forumIds = idList(query.fid);
			const forumName =
				forumIds.length === 1 && forumIds[0] !== undefined ? await this.deps.feeds.findForumName(forumIds[0], viewer.group.id) : null;
			const rows = await this.deps.feeds.listRecentTopics({
				groupId: viewer.group.id,
				forumIds,
				excludedForumIds: idList(query.nfid),
				orderPosted,
				limit,
			});
			feed = buildTopicsFeed(rows, forumName, orderPosted, input);
		}

		const context = { selfUrl: `${config.baseUrl}${request.url}`, version: config.shownVersion, now: this.deps.page.clock() };
		const body =
			type === 'rss'
				? renderRss(feed, context)
				: type === 'atom'
					? renderAtom(feed, context)
					: type === 'xml'
						? renderXml(feed)
						: renderHtmlList(feed);
		return reply.type(CONTENT_TYPES[type]).header('Cache-Control', 'must-revalidate').send(body);
	}

	private async online(request: FastifyRequest, reply: FastifyReply, full: boolean): Promise<FastifyReply> {
		const { viewer, board: config } = request;
		const t = this.deps.page.lang.index;
		const visitors = await this.deps.stats.listOnline();
		const users = visitors.filter((visitor) => visitor.userId > 1);
		const names = users.map((user) =>
			viewer.group.canViewUsers
				? `<a href="${escapeHtml(config.baseUrl)}/profile.php?id=${user.userId}">${escapeHtml(user.ident)}</a>`
				: escapeHtml(user.ident),
		);

		const lines = [
			`${t.guestsOnline} ${forumNumberFormat(visitors.length - users.length)}<br />`,
			full && names.length > 0 ? `${t.usersOnline} ${names.join(', ')}<br />` : `${t.usersOnline} ${forumNumberFormat(users.length)}<br />`,
		];
		return reply.type('text/html; charset=utf-8').send(`${lines.join('\n')}\n`);
	}

	private async stats(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
		const { viewer, board: config } = request;
		const t = this.deps.page.lang.index;
		const [info, totals] = await Promise.all([this.deps.usersInfo.load(), this.deps.stats.countTopicsAndPosts()]);
		const newest = info.newestUser;
		const newestHtml =
			newest === null
				? ''
				: viewer.group.canViewUsers
					? `<a href="${escapeHtml(config.baseUrl)}/profile.php?id=${newest.id}">${escapeHtml(newest.username)}</a>`
					: escapeHtml(newest.username);

		const lines = [
			`${t.totalUsers} ${forumNumberFormat(info.totalUsers)}<br />`,
			`${t.newestUser} ${newestHtml}<br />`,
			`${t.totalTopics} ${forumNumberFormat(totals.topics)}<br />`,
			`${t.totalPosts} ${forumNumberFormat(totals.posts)}<br />`,
		];
		return reply.type('text/html; charset=utf-8').send(`${lines.join('\n')}\n`);
	}
}
