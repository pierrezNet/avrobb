/**
 * Recherche : règles de search.php / search_idx.php (services purs) et page via app.inject().
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import type { SearchPost, SearchTopic } from '../src/domain/models.ts';
import type { SearchReader } from '../src/repositories/SearchRepository.ts';
import { phpUnserialize } from '../src/services/phpSerialize.ts';
import {
	combineKeywords,
	parseCachedSearch,
	parseSearchRequest,
	sortHits,
	splitSearchWords,
	type WordHit,
} from '../src/services/search.ts';
import { type FakeData, fakeDeps, guest, NOW, sessionCookie, viewer } from './fixtures.ts';

const member = { id: 3, isGuest: false, isAdmMod: false };

describe('parseSearchRequest', () => {
	it('valide une recherche par mots-clés comme search.php', () => {
		expect(
			parseSearchRequest({ action: 'search', keywords: '  Vintage LFTH ', forums: '2,x,2,5', sort_by: '9', show_as: 'topics' }, member),
		).toEqual({
			kind: 'search',
			keywords: 'vintage lfth',
			author: '',
			authorPattern: '',
			forums: [2, 5],
			searchIn: 0,
			sortBy: 0,
			sortDir: 'ASC',
			showAs: 'topics',
		});
		expect(parseSearchRequest({ action: 'search', keywords: 'ab', author: '*' }, member)).toBe('noTerms');
		expect(parseSearchRequest({ action: 'search', author: 'Tes*', forums: ['1', '3'] }, member)).toMatchObject({
			author: 'Tes*',
			authorPattern: 'tes%',
			forums: [1, 3],
		});
	});

	it('recherches rapides : droits et paramètres', () => {
		expect(parseSearchRequest({ action: 'show_24h' }, member)).toMatchObject({ action: 'show_recent', interval: 86_400 });
		expect(parseSearchRequest({ action: 'show_user', user_id: '6' }, member)).toMatchObject({ action: 'show_user_posts', userId: 6 });
		expect(parseSearchRequest({ action: 'show_user_topics', user_id: '1' }, member)).toBe('notFound');
		expect(parseSearchRequest({ action: 'show_subscriptions', user_id: '6' }, member)).toBe('noPermission');
		expect(parseSearchRequest({ action: 'show_subscriptions', user_id: '6' }, { ...member, isAdmMod: true })).toMatchObject({ userId: 6 });
		expect(parseSearchRequest({ action: 'show_new' }, { id: 1, isGuest: true, isAdmMod: false })).toBe('noPermission');
		expect(parseSearchRequest({ action: 'show_replies' }, { id: 1, isGuest: true, isAdmMod: false })).toBe('badRequest');
		expect(parseSearchRequest({ action: 'delete' }, member)).toBe('badRequest');
	});
});

describe('splitSearchWords (split_words())', () => {
	const stopwords = new Set(['les', 'pour']);
	it('retire ponctuation, BBCode, mots vides et mots trop courts ; garde jokers et opérateurs', () => {
		expect(splitSearchWords("[b]vol[/b] de nuit, pour l'avion atr-72 -- avi* and les c'est", stopwords)).toEqual([
			'vol',
			'nuit',
			"l'avion",
			'atr-72',
			'avi*',
			'and',
			"c'est",
		]);
		expect(splitSearchWords('a'.repeat(21), stopwords)).toEqual([]);
	});
});

describe('combineKeywords', () => {
	const hit = (postId: number, sortValue = postId): WordHit => ({ postId, topicId: postId * 10, sortValue });
	const index: Record<string, WordHit[]> = { vol: [hit(1), hit(2), hit(3)], nuit: [hit(2), hit(3), hit(4)], atr: [hit(3)] };
	const lookup = async (word: string) => index[word] ?? [];
	const ids = async (words: string[]) => [...(await combineKeywords(words, lookup)).keys()].sort();

	it('et implicite, ou, non ; l’opérateur reste valable pour les mots suivants', async () => {
		expect(await ids(['vol', 'nuit'])).toEqual([2, 3]);
		expect(await ids(['vol', 'or', 'nuit'])).toEqual([1, 2, 3, 4]);
		expect(await ids(['vol', 'not', 'nuit'])).toEqual([1]);
		// Le « not » reste actif : « nuit » est retiré aussi.
		expect(await ids(['vol', 'not', 'atr', 'nuit'])).toEqual([1]);
		expect(await ids(['inconnu', 'or', 'atr'])).toEqual([3]);
	});

	it('trie sur la colonne demandée, puis par message', () => {
		expect(sortHits([hit(1, 5), hit(2, 3), hit(3, 5)], 'DESC').map((h) => h.postId)).toEqual([1, 3, 2]);
		expect(
			sortHits(
				[
					{ postId: 1, topicId: 1, sortValue: 'b' },
					{ postId: 2, topicId: 1, sortValue: 'a' },
				],
				'ASC',
			).map((h) => h.postId),
		).toEqual([2, 1]);
	});
});

describe('parseCachedSearch (search_cache du PHP)', () => {
	const serialize = (ids: number[], type: string) => {
		const inner = `a:${ids.length}:{${ids.map((id, i) => `i:${i};i:${id};`).join('')}}`;
		return `a:6:{s:10:"search_ids";s:${inner.length}:"${inner}";s:8:"num_hits";i:${ids.length};s:7:"sort_by";i:0;s:8:"sort_dir";s:4:"DESC";s:7:"show_as";s:6:"topics";s:11:"search_type";${type}}`;
	};

	it('lit les identifiants et le type de recherche', () => {
		expect(
			parseCachedSearch(serialize([12, 7], 'a:4:{i:0;s:8:"keywords";i:1;s:9:"été vol";i:2;s:3:"1,2";i:3;i:0;}'), phpUnserialize),
		).toEqual({
			ids: [12, 7],
			showAs: 'topics',
			sortBy: 0,
			sortDir: 'DESC',
			type: { kind: 'keywords', keywords: 'été vol', author: '', forums: [1, 2], searchIn: 0 },
		});
		expect(parseCachedSearch(serialize([3], 'a:3:{i:0;s:6:"action";i:1;s:16:"show_user_topics";i:2;i:6;}'), phpUnserialize)?.type).toEqual({
			kind: 'action',
			action: 'show_user_topics',
			userId: 6,
		});
		expect(parseCachedSearch('O:8:"stdClass":0:{}', phpUnserialize)).toBeNull();
	});
});

const topicResult = (id: number, forumId = 2): SearchTopic => ({
	id,
	poster: 'Tessy',
	subject: `Sujet ${id}`,
	posted: NOW - 9000,
	lastPost: { postedAt: NOW - 600, postId: id * 10, poster: 'admin' },
	numViews: 5,
	numReplies: 1,
	closed: false,
	sticky: id === 1,
	movedTo: null,
	hasPosted: false,
	forumId,
	forumName: 'Captures',
});

const postResult = (id: number): SearchPost => ({
	id,
	poster: 'Tessy',
	posterId: 3,
	posted: NOW - 1000,
	message: `Message [b]${id}[/b] :)`,
	hideSmilies: false,
	topicId: 1,
	subject: 'Sujet 1',
	firstPostId: 1,
	topicLastPost: NOW - 600,
	numReplies: 4,
	forumId: 2,
	forumName: 'Captures',
});

function fakeSearch(overrides: Partial<SearchReader> = {}): SearchReader {
	return {
		matchWord: async (pattern) => (pattern === 'vintage' ? [1, 2, 3].map((id) => ({ postId: id, topicId: 1, sortValue: id })) : []),
		matchAuthor: async () => [{ postId: 2, topicId: 1, sortValue: 2 }],
		quickSearch: async () => Array.from({ length: 35 }, (_, i) => i + 1),
		listTopics: async (ids) => ids.map((id) => topicResult(id)),
		listPosts: async (ids) => ids.map(postResult),
		findUsername: async (id) => (id === 6 ? 'valdefsx' : null),
		findCachedSearch: async () => null,
		...overrides,
	};
}

const SEED = 'graine-de-test';
const cookie = (userId: number, hash: string): string => {
	const expires = NOW + 3600;
	return `${sessionCookie(userId, expires)}`;
};
const users = [{ viewer: guest }, { viewer: viewer({ lastVisit: NOW - 3600 }) }];

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

describe('GET /search.php', () => {
	/** Doublures avec un search_cache en mémoire partagé entre lecture et écriture. */
	const deps = (search: Partial<SearchReader> = {}) => {
		const data: FakeData = { users, topics: [], posts: new Map() };
		const base = fakeDeps(data);
		return {
			...base,
			search: { ...fakeSearch(search), findCachedSearch: search.findCachedSearch ?? base.search.findCachedSearch },
			data,
		};
	};

	/** Lance une recherche et suit la redirection vers sa page de résultats (search_id). */
	const searchFor = async (url: string, headers: Record<string, string> = {}) => {
		if (app === undefined) throw new Error('application non démarrée');
		const first = await app.inject({ url, headers });
		if (first.statusCode !== 302) return first;
		return app.inject({ url: `/${first.headers.location}`, headers });
	};

	it('affiche le formulaire avec les forums à cocher', async () => {
		app = await buildApp(deps());
		const res = await app.inject('/search.php');
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('<input type="hidden" name="action" value="search">');
		expect(res.body).toContain('<input type="checkbox" name="forums" value="2"> Captures &amp; Vidéos');
	});

	it('mots-clés affichés en messages : message rendu, fil d’Ariane qui relance la recherche', async () => {
		app = await buildApp(deps());
		const res = await searchFor('/search.php?action=search&keywords=vintage&show_as=posts');
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('Message <strong>1</strong> <span class="smiley"');
		expect(res.body).toContain('Messages contenant « vintage »');
		expect(res.body).toContain(
			'search.php?action=search&amp;keywords=vintage&amp;author=&amp;forums=&amp;search_in=0&amp;sort_by=0&amp;sort_dir=ASC&amp;show_as=posts',
		);
		expect(res.body.match(/class="post__number"/g)).toHaveLength(3);
	});

	it('mots-clés et auteur : intersection', async () => {
		app = await buildApp(deps());
		const res = await searchFor('/search.php?action=search&keywords=vintage&author=tessy&show_as=posts');
		expect(res.body.match(/class="post__number"/g)).toHaveLength(1);
		expect(res.body).toContain('Messages de tessy contenant « vintage »');
	});

	it('recherche rapide paginée avec ses paramètres, nom du membre dans le fil d’Ariane', async () => {
		app = await buildApp(deps());
		const res = await app.inject('/search.php?action=show_user_topics&user_id=6');
		expect(res.body).toContain('Discussions de valdefsx');
		expect(res.body.match(/<h3 class="forum-row__name/g)).toHaveLength(30);
		const searchId = /href="search\.php\?search_id=(\d+)&amp;p=2"/.exec(res.body)?.[1];
		expect(searchId).toBeDefined();
		// La page 2 relit les résultats mémorisés (même propriétaire : l'invité, par son IP).
		const page2 = await app.inject(`/search.php?search_id=${searchId}&p=2`);
		expect(page2.body.match(/<h3 class="forum-row__name/g)).toHaveLength(5);
		expect(res.body).toContain('<span class="badge">Épinglée :</span>');
	});

	it('messages d’absence de résultat et refus', async () => {
		app = await buildApp(deps({ quickSearch: async () => [] }));
		expect((await app.inject('/search.php?action=show_unanswered')).body).toContain('Il n&#39;y a pas de message sans réponse');
		expect((await app.inject('/search.php?action=search&keywords=xyzzy')).body).toContain('aucun résultat');
		expect((await app.inject('/search.php?action=search&keywords=ab')).body).toContain('Vous devez saisir au moins un mot-clé');
		expect((await app.inject('/search.php?action=show_new')).statusCode).toBe(403);
		expect((await app.inject('/search.php?search_id=0')).statusCode).toBe(404);
	});

	it('mémorise la recherche au format du PHP et applique l’anti-flood (last_search)', async () => {
		const setup = deps();
		app = await buildApp(setup);
		const res = await app.inject('/search.php?action=search&keywords=vintage');
		expect(res.statusCode).toBe(302);
		const id = Number(/search_id=(\d+)/.exec(String(res.headers.location))?.[1]);
		const cached = setup.data.searchCache?.get(id);
		expect(cached?.ident).toBe('127.0.0.1');
		expect(cached?.data).toMatch(/^a:6:\{s:10:"search_ids";s:\d+:"a:3:\{/);
		expect(cached?.data).toContain('s:11:"search_type";a:4:{i:0;s:8:"keywords";i:1;s:7:"vintage";i:2;s:0:"";i:3;i:0;}');
		expect(setup.data.searchLog).toEqual([`invité 127.0.0.1 ${NOW}`]);
		await app.close();

		const member = deps();
		app = await buildApp({
			...member,
			users: {
				findViewer: async (uid: number) =>
					uid === 3 ? { presence: null, viewer: viewer({ lastSearch: NOW - 5 }) } : member.users.findViewer(uid),
			},
		});
		const flood = await app.inject({ url: '/search.php?action=search&keywords=vintage', headers: { cookie: cookie(3, 'hash-tessy') } });
		expect(flood.statusCode).toBe(429);
		expect(flood.body).toContain('Vous devez patienter au minimum 30 secondes');
	});

	it('relit une recherche mise en cache par le PHP, pour son seul propriétaire', async () => {
		const inner = 'a:2:{i:0;i:4;i:1;i:5;}';
		const data = `a:6:{s:10:"search_ids";s:${inner.length}:"${inner}";s:8:"num_hits";i:2;s:7:"sort_by";i:0;s:8:"sort_dir";s:4:"DESC";s:7:"show_as";s:6:"topics";s:11:"search_type";a:2:{i:0;s:6:"action";i:1;s:15:"show_unanswered";}}`;
		app = await buildApp(deps({ findCachedSearch: async (id, ident) => (id === 77 && ident === 'Tessy' ? data : null) }));

		const own = await app.inject({ url: '/search.php?search_id=77', headers: { cookie: cookie(3, 'hash-tessy') } });
		expect(own.body.match(/<h3 class="forum-row__name/g)).toHaveLength(2);
		expect(own.body).toContain('>Sans réponse</a>');
		expect((await app.inject('/search.php?search_id=77')).body).toContain('aucun résultat');
	});
});
