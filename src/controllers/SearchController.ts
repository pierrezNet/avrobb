/**
 * Contrôleur de search.php : formulaire, recherches par mots-clés ou auteur, recherches rapides.
 *
 * Comme le PHP, une recherche est faite une seule fois : ses résultats sont mémorisés dans
 * search_cache (lisible par le PHP) et les pages suivantes les relisent (search.php?search_id=N).
 * Une recherche par mots-clés ou auteur est soumise à l'anti-flood du groupe (g_search_flood) et
 * redirige vers sa page de résultats. Exception documentée à « pas d'écriture en GET » : comme
 * dans le PHP, le formulaire de recherche est en GET et écrit last_search et search_cache.
 */

import { randomInt } from 'node:crypto';
import type { AppReply, AppRequest } from '../http/context.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildSearchForm, buildSearchResults } from '../presenters/searchPage.ts';
import type { CensorReader } from '../repositories/CensorRepository.ts';
import type { ForumReader } from '../repositories/ForumRepository.ts';
import type { ForumScope, SearchReader, SearchWriter } from '../repositories/SearchRepository.ts';
import type { StopwordsReader } from '../repositories/StopwordsLoader.ts';
import { buildCensor } from '../services/censor.ts';
import { floodWait } from '../services/flood.ts';
import { clampPage, pageCount } from '../services/pagination.ts';
import { isAnyModerator } from '../services/permissions.ts';
import { phpSerialize, phpUnserialize } from '../services/phpSerialize.ts';
import {
	type ActionSearch,
	combineKeywords,
	type KeywordSearch,
	parseCachedSearch,
	parseSearchRequest,
	resultIds,
	type SearchOutcome,
	type SearchParams,
	type SearchType,
	serializeSearch,
	sortHits,
	splitSearchWords,
} from '../services/search.ts';
import { parseTrackedTopics } from '../services/trackedTopics.ts';
import { positiveInt } from './params.ts';

export interface SearchControllerDeps extends LayoutDeps {
	search: SearchReader;
	searchWriter: SearchWriter;
	forums: ForumReader;
	stopwords: StopwordsReader;
	censorship: CensorReader;
	trackCookieName: string;
}

export interface SearchQuery extends SearchParams {
	search_id?: string;
	p?: string;
	/** Forme des formulaires PHP (forums[]=1&forums[]=2). */
	'forums[]'?: string | string[];
}

type Lang = SearchControllerDeps['page']['lang'];

/** Résultat d'une recherche par mots-clés et/ou auteur (pas une recherche rapide). */
type KeywordOutcome = SearchOutcome & { type: Exclude<SearchType, { kind: 'action' }> };

/** Message affiché quand une recherche rapide ne trouve rien (search.php). */
function noResultsMessage(outcome: SearchOutcome, lang: Lang): string {
	const t = lang.search;
	if (outcome.type.kind !== 'action') return t.noHits;
	switch (outcome.type.action) {
		case 'show_new':
			return t.noNewPosts;
		case 'show_recent':
			return t.noRecentPosts;
		case 'show_user_topics':
			return t.noUserTopics;
		case 'show_subscriptions':
			return t.noSubscriptions;
		case 'show_unanswered':
			return t.noUnanswered;
		default:
			return t.noUserPosts;
	}
}

export class SearchController {
	constructor(private readonly deps: SearchControllerDeps) {}

	show = async (request: AppRequest<{ Querystring: SearchQuery }>, reply: AppReply): Promise<AppReply> => {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		const { query } = request;

		if (!viewer.group.canReadBoard) return renderMessage(request, reply, this.deps, 403, lang.common.noView);
		if (!viewer.group.canSearch) return renderMessage(request, reply, this.deps, 403, lang.search.noSearchPermission);

		if (query.search_id !== undefined) {
			const searchId = positiveInt(query.search_id);
			if (searchId === 0) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
			// Identifiant du propriétaire de la recherche, comme search.php : IP pour un invité.
			const data = await this.deps.search.findCachedSearch(searchId, this.ident(request));
			const outcome = data !== null ? parseCachedSearch(data, phpUnserialize) : null;
			if (outcome === null) return renderMessage(request, reply, this.deps, 200, lang.search.noHits);
			return this.results(request, reply, outcome, (page) => `search.php?search_id=${searchId}&p=${page}`);
		}

		if (query.action === undefined) return this.form(request, reply);

		const legacyForums = query['forums[]'];
		const params: SearchParams = legacyForums !== undefined && query.forums === undefined ? { ...query, forums: legacyForums } : query;
		const parsed = parseSearchRequest(params, { id: viewer.id, isGuest: viewer.isGuest, isAdmMod: isAnyModerator(viewer) });
		if (typeof parsed === 'string') {
			const [status, message] = {
				badRequest: [400, lang.common.badRequest],
				notFound: [404, lang.common.badRequest],
				noPermission: [403, lang.common.noPermission],
				noTerms: [200, lang.search.noTerms],
			}[parsed] as [number, string];
			return renderMessage(request, reply, this.deps, status, message);
		}

		if (parsed.kind === 'search') {
			const now = this.deps.page.clock();
			const wait = floodWait(viewer.lastSearch, viewer.group.searchFlood, now);
			if (wait !== null) return renderMessage(request, reply, this.deps, 429, lang.search.searchFlood(viewer.group.searchFlood));
			await this.deps.searchWriter.recordSearch(viewer.isGuest ? { ip: request.ip } : { userId: viewer.id }, now);

			const outcome = await this.keywordSearch(
				parsed,
				viewer.group.id,
				this.scope(parsed.forums, config.searchAllForums || isAnyModerator(viewer)),
			);
			if (outcome.ids.length === 0) return renderMessage(request, reply, this.deps, 200, noResultsMessage(outcome, lang));
			const searchId = await this.remember(request, outcome);
			return reply.redirect(`search.php?search_id=${searchId}`);
		}

		const outcome = await this.quickSearch(parsed, viewer.group.id, viewer.lastVisit);
		if (outcome.ids.length === 0) return renderMessage(request, reply, this.deps, 200, noResultsMessage(outcome, lang));
		const searchId = await this.remember(request, outcome);
		return this.results(request, reply, outcome, (page) => `search.php?search_id=${searchId}&p=${page}`);
	};

	/** Propriétaire d'une recherche mémorisée, comme search.php : pseudo, ou IP pour un invité. */
	private ident(request: AppRequest): string {
		return request.viewer.isGuest ? request.ip : request.viewer.username;
	}

	/** Mémorise les résultats dans search_cache (identifiant tiré au sort comme mt_rand()). */
	private async remember(request: AppRequest, outcome: SearchOutcome): Promise<number> {
		const searchId = randomInt(1, 2_147_483_647);
		await this.deps.searchWriter.saveCachedSearch(searchId, this.ident(request), serializeSearch(outcome, phpSerialize));
		return searchId;
	}

	private async form(request: AppRequest, reply: AppReply): Promise<AppReply> {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		const forums = await this.deps.forums.listReadable(viewer.group.id);

		return renderPage(
			request,
			reply,
			this.deps,
			'search.njk',
			{ pageId: 'search', titleParts: [config.boardTitle, lang.search.search], activeNav: 'search' },
			buildSearchForm(viewer, config, forums, lang),
		);
	}

	/**
	 * Forums où chercher : ceux demandés, sinon tous… sauf si la recherche dans tous les forums est
	 * désactivée pour ce membre (le PHP produisait alors une requête « IN () » invalide : aucun résultat).
	 */
	private scope(forums: readonly number[], allForumsAllowed: boolean): ForumScope {
		if (forums.length > 0) return forums;
		return allForumsAllowed ? null : [];
	}

	private async keywordSearch(request: KeywordSearch, groupId: number, scope: ForumScope): Promise<KeywordOutcome> {
		const { search } = this.deps;
		let keywordHits: Map<number, { postId: number; topicId: number; sortValue: string | number }> | null = null;

		if (request.keywords !== '') {
			const words = splitSearchWords(request.keywords, await this.deps.stopwords.load());
			keywordHits = await combineKeywords(words, (word) =>
				search.matchWord(word.replaceAll('*', '%'), request.searchIn, groupId, scope, request.sortBy, request.showAs),
			);
		}

		// « guest » et « invité » ne désignent pas un membre (search.php).
		const guestNames = new Set(['guest', this.deps.page.lang.common.guest.toLowerCase()]);
		const authorHits =
			request.authorPattern !== '' && !guestNames.has(request.authorPattern)
				? await search.matchAuthor(request.authorPattern, groupId, scope, request.sortBy, request.showAs, request.sortDir)
				: null;

		let hits: { postId: number; topicId: number }[];
		if (keywordHits !== null && authorHits !== null) {
			const byAuthor = new Set(authorHits.map((hit) => hit.postId));
			hits = sortHits(keywordHits.values(), request.sortDir).filter((hit) => byAuthor.has(hit.postId));
		} else if (keywordHits !== null) hits = sortHits(keywordHits.values(), request.sortDir);
		else hits = authorHits ?? [];

		const kind = keywordHits !== null && request.author !== '' ? 'both' : keywordHits !== null ? 'keywords' : 'author';
		return {
			ids: resultIds(hits, request.showAs),
			showAs: request.showAs,
			sortBy: request.sortBy,
			sortDir: request.sortDir,
			type: { kind, keywords: request.keywords, author: request.author, forums: request.forums, searchIn: request.searchIn },
		};
	}

	private async quickSearch(request: ActionSearch, groupId: number, lastVisit: number): Promise<SearchOutcome> {
		const { search } = this.deps;
		const now = this.deps.page.clock();
		let ids: number[];

		switch (request.action) {
			case 'show_new':
				ids = await search.quickSearch({ action: 'show_new', groupId, since: lastVisit, forumId: request.forumId });
				break;
			case 'show_recent':
				ids = await search.quickSearch({ action: 'show_recent', groupId, since: now - request.interval, forumId: request.forumId });
				break;
			case 'show_unanswered':
				ids = await search.quickSearch({ action: 'show_unanswered', groupId });
				break;
			default:
				ids = await search.quickSearch({ action: request.action, groupId, userId: request.userId });
		}

		const forUser =
			request.action === 'show_user_posts' || request.action === 'show_user_topics' || request.action === 'show_subscriptions';
		return {
			ids,
			showAs: request.action === 'show_user_posts' ? 'posts' : 'topics',
			sortBy: 0,
			sortDir: 'DESC',
			type: { kind: 'action', action: request.action, userId: forUser ? request.userId : null },
		};
	}

	private async results(
		request: AppRequest<{ Querystring: SearchQuery }>,
		reply: AppReply,
		outcome: SearchOutcome,
		pageUrl: (page: number) => string,
	): Promise<AppReply> {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;

		if (outcome.ids.length === 0) return renderMessage(request, reply, this.deps, 200, noResultsMessage(outcome, lang));

		const perPage =
			outcome.showAs === 'posts'
				? (viewer.postsPerPage ?? config.defaultPostsPerPage)
				: (viewer.topicsPerPage ?? config.defaultTopicsPerPage);
		const numPages = pageCount(outcome.ids.length, perPage);
		const page = clampPage(request.query.p, numPages);
		const pageIds = outcome.ids.slice((page - 1) * perPage, page * perPage);
		const userId = outcome.type.kind === 'action' ? outcome.type.userId : null;

		const [topics, posts, censoredWords, username] = await Promise.all([
			outcome.showAs === 'topics' ? this.deps.search.listTopics(pageIds, outcome.sortBy, outcome.sortDir) : [],
			outcome.showAs === 'posts' ? this.deps.search.listPosts(pageIds, outcome.sortBy, outcome.sortDir) : [],
			config.censoring ? this.deps.censorship.listWords() : [],
			userId !== null ? this.deps.search.findUsername(userId) : null,
		]);

		const view = buildSearchResults({
			viewer,
			config,
			outcome,
			topics,
			posts,
			tracked: parseTrackedTopics(request.cookies[this.deps.trackCookieName]),
			censor: config.censoring ? buildCensor(censoredWords) : null,
			username,
			page,
			numPages,
			firstPosition: (page - 1) * perPage + 1,
			pageUrl,
			lang,
			dateWords: this.deps.page.dateWords,
			now: this.deps.page.clock(),
		});

		return renderPage(
			request,
			reply,
			this.deps,
			'search_results.njk',
			{ pageId: 'search', titleParts: [config.boardTitle, lang.search.results], activeNav: 'search' },
			view,
		);
	}
}
