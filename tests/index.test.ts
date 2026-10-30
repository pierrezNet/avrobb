/**
 * Index : services (nombres, suivi des sujets lus), presenter et page via app.inject().
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import type { ForumSummary, IndexCategory } from '../src/domain/models.ts';
import { forumNumberFormat, niceNumber } from '../src/services/numberFormat.ts';
import { forumHasNewPosts, parseTrackedTopics } from '../src/services/trackedTopics.ts';
import { fakeDeps, group, guest, NOW, sessionCookie, viewer } from './fixtures.ts';

describe('formatage des nombres', () => {
	it('bd_nice_number() et forum_number_format()', () => {
		expect(niceNumber(999)).toBe('999');
		expect(niceNumber(1000)).toBe('1,000');
		expect(niceNumber(12_345)).toBe('12.3 k');
		expect(niceNumber(2_500_000)).toBe('2.5 M');
		expect(forumNumberFormat(1_234_567)).toBe('1 234 567');
	});
});

describe('suivi des sujets lus', () => {
	const tracked = parseTrackedTopics('t10=1000;t11=2000;f2=1500;x;t0=5;tabc=1;');
	const recent = [
		{ forumId: 1, topicId: 10, lastPost: 1200 },
		{ forumId: 2, topicId: 11, lastPost: 1800 },
	];

	it('lit le format t<id>=<horodatage>;f<id>=…', () => {
		expect([...tracked.topics]).toEqual([
			[10, 1000],
			[11, 2000],
		]);
		expect([...tracked.forums]).toEqual([[2, 1500]]);
		expect(parseTrackedTopics('x'.repeat(5000)).topics.size).toBe(0);
	});

	it('reproduit la règle des nouveaux messages de index.php', () => {
		// Sujet 10 modifié après sa lecture : nouveau.
		expect(forumHasNewPosts(1, 1200, 900, recent, tracked)).toBe(true);
		// Sujet 11 déjà lu après son dernier message : rien de nouveau.
		expect(forumHasNewPosts(2, 1800, 900, recent, tracked)).toBe(false);
		// Dernier message antérieur à la dernière visite.
		expect(forumHasNewPosts(1, 1200, 1300, recent, tracked)).toBe(false);
		// Forum marqué comme lu après son dernier message.
		expect(forumHasNewPosts(2, 1400, 900, recent, parseTrackedTopics('f2=1500'))).toBe(false);
	});
});

function forum(id: number, overrides: Partial<ForumSummary> = {}): ForumSummary {
	return {
		id,
		name: `Forum ${id}`,
		descriptionHtml: '',
		redirectUrl: null,
		moderators: new Map(),
		numTopics: 3,
		numPosts: 12_345,
		lastPost: { postedAt: NOW - 600, postId: 42, poster: 'Tessy' },
		...overrides,
	};
}

const categories: IndexCategory[] = [
	{
		id: 1,
		name: 'Simulateurs <FS>',
		forums: [
			forum(1, { descriptionHtml: '<em>Réglages</em>', moderators: new Map([['MaxDUO', 5]]) }),
			forum(2, { redirectUrl: 'https://example.test', lastPost: null }),
			forum(3, { lastPost: null }),
		],
	},
];

const cookie = (userId: number, extra = ''): string => `${sessionCookie(userId)}${extra}`;

const tessy = viewer({ lastVisit: NOW - 3600 });
const users = [{ viewer: guest }, { viewer: tessy }];

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

describe('GET /index.php', () => {
	it('liste catégories et forums, échappés, avec l’activité de la semaine', async () => {
		app = await buildApp(
			fakeDeps({
				users,
				topics: [],
				posts: new Map(),
				indexCategories: categories,
				online: [
					{ userId: 3, ident: 'Tessy' },
					{ userId: 1, ident: '192.0.2.1' },
					{ userId: 1, ident: '192.0.2.2' },
				],
				hotTopics: [
					{ id: 10, subject: '[MSFS] Vol <de nuit>', recentPosts: 5, numReplies: 9, lastPostAt: 0 },
					{ id: 11, subject: 'Sans image', recentPosts: 1, numReplies: 1, lastPostAt: 0 },
				],
				hotTopicImages: new Map([[10, 'Voyez [img]http://forum.test/img/gallery/42.webp[/img] et [img]javascript:x[/img]']]),
				newMembers: [{ id: 8, username: 'Nouveau', registered: 0 }],
				activeSubjects: ['[MSFS] A', '[MSFS][X-Plane] B', 'C', '[X-Plane] D', '[MSFS] E'],
			}),
		);

		const res = await app.inject('/index.php');
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('<title>Forum de test</title>');
		expect(res.body).toContain('Simulateurs &lt;FS&gt;');
		expect(res.body).toContain('<div class="forum-row__desc"><em>Réglages</em></div>');
		expect(res.body).toContain('<a href="profile.php?id=5">MaxDUO</a>');
		expect(res.body).toContain('<span class="forum-row__redirect">Lien vers :</span> <a href="https://example.test">Forum 2</a>');
		expect(res.body).toContain('<dd>12.3 k</dd>');
		expect(res.body).toContain('- - -');
		expect(res.body).toContain('Jamais');
		// Les totaux sont sur la page Statistiques ; en ligne : avatars (ou initiale) et invités.
		expect(res.body).not.toContain('Nombre total de messages');
		expect(res.body).toContain('<span class="online-avatars__initial" aria-hidden="true">T</span>');
		expect(res.body).toContain('+ 2 invités');
		// Discussions de la semaine : dernière image (variante mobile), pastilles, activité.
		expect(res.body).toContain('src="http://forum.test/img/gallery/mobile_42.webp"');
		expect(res.body).toContain('Vol &lt;de nuit&gt;');
		expect(res.body).toContain('5 messages cette semaine');
		expect(res.body).toContain('hot-topics__image--none');
		// Projets : MSFS 3, X-Plane 2 (C sans balise ignoré).
		expect(res.body).toMatch(/MSFS<\/span>\s*<span class="project-shares__bar"[^>]*><span style="width: 60%/);
		expect(res.body).toContain('X-Plane : 2 discussions');
		expect(res.body).toContain('<a href="profile.php?id=8">Nouveau</a>');
		expect(res.body).not.toContain('Nouveaux messages');
		expect(res.body).not.toContain('misc.php?action=markread');
		// L'index est porté : ses liens restent locaux.
		expect(res.body).toContain('href="index.php"');
	});

	it('est aussi servi à la racine', async () => {
		app = await buildApp(fakeDeps({ users, topics: [], posts: new Map(), indexCategories: categories }));
		expect((await app.inject('/')).statusCode).toBe(200);
	});

	it('signale les nouveaux messages au membre selon son cookie de suivi', async () => {
		app = await buildApp(
			fakeDeps({
				users,
				topics: [],
				posts: new Map(),
				indexCategories: categories,
				recentTopics: [{ forumId: 1, topicId: 7, lastPost: NOW - 600 }],
			}),
		);

		const fresh = await app.inject({ url: '/index.php', headers: { cookie: cookie(3) } });
		expect(fresh.body).toContain('href="search.php?action=show_new&amp;fid=1">Nouveaux messages</a>');
		expect(fresh.body).toContain('misc.php?action=markread');

		const read = await app.inject({ url: '/index.php', headers: { cookie: `${cookie(3)}; avrobb_track=t7=${NOW}` } });
		expect(read.body).not.toContain('Nouveaux messages');
	});

	it('refuse l’accès sans g_read_board', async () => {
		const blind = { ...guest, group: group({ id: 3, canReadBoard: false }) };
		app = await buildApp(fakeDeps({ users: [{ viewer: blind }], topics: [], posts: new Map() }));
		expect((await app.inject('/index.php')).statusCode).toBe(403);
	});
});
