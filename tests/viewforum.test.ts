/**
 * viewforum : mise en forme des balises (balises.php), presenter et page via app.inject().
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { type ForumInfo, GroupId, type TopicLabel, type TopicSummary } from '../src/domain/models.ts';
import { forumHmac } from '../src/services/legacySession.ts';
import { labelCss, styleSubject } from '../src/services/topicLabels.ts';
import { fakeDeps, group, guest, NOW, viewer } from './fixtures.ts';

const solved: TopicLabel = {
	id: 1,
	name: 'Réglé',
	style: 'brackets',
	color: '#00AA00',
	bold: true,
	italic: false,
	underline: false,
	moderatorVisible: true,
};
const pending: TopicLabel = {
	id: 2,
	name: 'En cours',
	style: 'hashes',
	color: 'red;background:url(x)',
	bold: false,
	italic: true,
	underline: false,
	moderatorVisible: true,
};

describe('styleSubject (balises.php)', () => {
	it('met en forme la première occurrence de chaque balise, même tapée par le membre', () => {
		expect(styleSubject('[Réglé] Panne #En cours# moteur [Réglé]', [solved, pending])).toEqual([
			{ text: '[Réglé]', style: { color: '#00AA00', bold: true, italic: false, underline: false } },
			{ text: ' Panne ', style: null },
			{ text: '#En cours#', style: { color: null, bold: false, italic: true, underline: false } },
			{ text: ' moteur [Réglé]', style: null },
		]);
		expect(styleSubject('Sans balise', [solved])).toEqual([{ text: 'Sans balise', style: null }]);
	});

	it('refuse une couleur qui sortirait de la propriété CSS', () => {
		expect(labelCss({ color: null, bold: true, italic: true, underline: true })).toBe(
			'font-weight: bold; font-style: italic; text-decoration: underline',
		);
	});
});

function summary(id: number, overrides: Partial<TopicSummary> = {}): TopicSummary {
	return {
		id,
		poster: 'Tessy',
		subject: `Sujet ${id}`,
		posted: NOW - 86_400,
		lastPost: { postedAt: NOW - 600, postId: id * 10, poster: 'admin' },
		numViews: 1500,
		numReplies: 2,
		closed: false,
		sticky: false,
		movedTo: null,
		hasPosted: false,
		...overrides,
	};
}

const forumInfo: ForumInfo = {
	id: 2,
	name: 'Captures & <Vidéos>',
	redirectUrl: null,
	moderators: new Map([['MaxDUO', 5]]),
	numTopics: 4,
	sortBy: 'lastPost',
	topicPermission: null,
	isSubscribed: false,
};

const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true }), lastVisit: NOW - 3600 });
const tessy = viewer({ lastVisit: NOW - 3600, postsPerPage: 1 });
const users = [
	{ viewer: guest, passwordHash: '' },
	{ viewer: tessy, passwordHash: 'hash-tessy' },
	{ viewer: mod, passwordHash: 'hash-mod' },
];
const SEED = 'graine-de-test';
const cookie = (userId: number, hash: string): string => {
	const expires = NOW + 3600;
	return `punbb_cookie=${userId}|${forumHmac(hash, `${SEED}_password_hash`)}|${expires}|${forumHmac(`${userId}|${expires}`, `${SEED}_cookie_hash`)}`;
};

const topics = [
	summary(10, { sticky: true, subject: 'Règles du forum' }),
	summary(11, { closed: true, hasPosted: true }),
	summary(12, { movedTo: 40, lastPost: null }),
	summary(13, { numReplies: 30 }),
];

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

describe('GET /viewforum.php', () => {
	const deps = (overrides = {}) =>
		fakeDeps({
			users,
			topics: [],
			posts: new Map(),
			forumInfos: [forumInfo, { ...forumInfo, id: 3, redirectUrl: 'https://example.test/' }],
			forumTopics: new Map([[2, topics]]),
			topicLabels: new Map([[13, [solved]]]),
			labelDefinitions: [solved],
			...overrides,
		});

	it('liste les sujets : épinglé, fermé, déplacé, balise colorée, compteurs', async () => {
		app = await buildApp(deps());
		const res = await app.inject('/viewforum.php?id=2');

		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('<title>Captures &amp; &lt;Vidéos&gt; (Page 1) / Forum de test</title>');
		expect(res.body).toContain('topic-row--sticky');
		expect(res.body).toContain('<span class="badge">Fermée :</span>');
		expect(res.body).toContain('<span class="badge">Déplacée :</span> <a href="viewtopic.php?id=40">');
		expect(res.body).toContain(
			'<span class="subject-tag" style="background-color: #00AA00; color: #1a1a1a">Réglé</span><span class="subject-tag-gap">&#160;</span>Sujet 13',
		);
		expect(res.body).toContain('<dd>1 500</dd>');
		expect(res.body).toContain('href="post.php?fid=2"');
		expect(res.body).not.toContain('misc.php?action=subscribe');
		expect(res.body).not.toContain('moderate.php?fid=2');
		// Le point n'est affiché qu'aux membres, et seulement si o_show_dot est activé.
		expect(res.body).not.toContain('topic-row__dot');
	});

	it('membre : nouveaux messages, mini-pagination, abonnement, point', async () => {
		app = await buildApp(deps({ config: { showDot: true } }));
		const res = await app.inject({ url: '/viewforum.php?id=2', headers: { cookie: cookie(3, 'hash-tessy') } });

		expect(res.body).toContain('viewtopic.php?id=13&amp;action=new');
		expect(res.body).not.toContain('viewtopic.php?id=12&amp;action=new');
		// 31 messages à 1 par page : 1 2 … 31
		expect(res.body).toContain('<a href="viewtopic.php?id=13&amp;p=31">31</a>');
		expect(res.body).toContain('misc.php?action=subscribe&amp;fid=2');
		expect(res.body).toContain('misc.php?action=markforumread&amp;fid=2');
		expect(res.body).toContain('topic-row__dot');
	});

	it('modérateur du forum : lien de modération du pied', async () => {
		app = await buildApp(deps());
		const res = await app.inject({ url: '/viewforum.php?id=2', headers: { cookie: cookie(5, 'hash-mod') } });
		expect(res.body).toContain('moderate.php?fid=2&amp;p=1');
	});

	it('redirige les forums de redirection, 404 si illisible ou inexistant', async () => {
		app = await buildApp(deps({ forumReaders: new Map([[2, [GroupId.Admin]]]) }));
		const redirect = await app.inject('/viewforum.php?id=3');
		expect(redirect.statusCode).toBe(302);
		expect(redirect.headers.location).toBe('https://example.test/');
		expect((await app.inject('/viewforum.php?id=2')).statusCode).toBe(404);
		expect((await app.inject('/viewforum.php?id=abc')).statusCode).toBe(404);
	});

	it('forum vide et permission de créer des sujets retirée par forum_perms', async () => {
		app = await buildApp(deps({ forumTopics: new Map(), forumInfos: [{ ...forumInfo, topicPermission: false, numTopics: 0 }] }));
		const res = await app.inject('/viewforum.php?id=2');
		expect(res.body).toContain('Le forum ne contient aucune discussion.');
		expect(res.body).not.toContain('post.php?fid=2');
	});
});
