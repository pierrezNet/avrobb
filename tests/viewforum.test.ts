/**
 * viewforum : presenter et page via inject(app, ).
 */

import { describe, expect, it } from 'vitest';
import { buildApp, type ForumApp } from '../src/app.ts';
import { type ForumInfo, GroupId, type TopicSummary } from '../src/domain/models.ts';
import { fakeDeps, group, guest, NOW, sessionCookie, viewer } from './fixtures.ts';
import { inject } from './inject.ts';

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
	links: { site: null, repository: 'https://github.com/x/captures' },
	descriptionHtml: '<em>Vos plus beaux vols</em>',
	moderators: new Map([['MaxDUO', 5]]),
	numTopics: 4,
	sortBy: 'lastPost',
	topicPermission: null,
	isSubscribed: false,
};

const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true }), lastVisit: NOW - 3600 });
const tessy = viewer({ lastVisit: NOW - 3600, postsPerPage: 1 });
const users = [{ viewer: guest }, { viewer: tessy }, { viewer: mod }];

const topics = [
	summary(10, { sticky: true, subject: 'Règles du forum' }),
	summary(11, { closed: true, hasPosted: true }),
	summary(12, { movedTo: 40, lastPost: null }),
	summary(13, { numReplies: 30, subject: '[MSFS] Sujet 13' }),
];

let app: ForumApp | undefined;

describe('GET /viewforum.php', () => {
	const deps = (overrides = {}) =>
		fakeDeps({
			users,
			topics: [],
			posts: new Map(),
			forumInfos: [forumInfo, { ...forumInfo, id: 3, redirectUrl: 'https://example.test/' }],
			forumTopics: new Map([[2, topics]]),
			...overrides,
		});

	it('liste les sujets : épinglé, fermé, déplacé, balise colorée, compteurs', async () => {
		app = await buildApp(deps());
		const res = await inject(app, '/viewforum.php?id=2');

		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('<title>Captures &amp; &lt;Vidéos&gt; (Page 1) / Forum de test</title>');
		expect(res.body).toContain('topic-row--sticky');
		// Description du forum (HTML de l'administrateur) sous le titre, comme sur l'index.
		expect(res.body).toContain('<div class="page-intro forum-description"><em>Vos plus beaux vols</em></div>');
		expect(res.body).toContain('<ul class="project-links project-links--page" aria-label="Liens du projet">');
		expect(res.body).toContain('href="https://github.com/x/captures" rel="external noopener">Dépôt');
		expect(res.body).toContain('<span class="badge">Fermée :</span>');
		expect(res.body).toContain('<span class="badge">Déplacée :</span> <a href="/sujet/40-');
		expect(res.body).toContain(
			'<span class="subject-tag" style="background-color: #1d4ed8; color: #ffffff">MSFS</span><span class="subject-tag-gap">&#160;</span>Sujet 13',
		);
		expect(res.body).toContain('<dd>1 500</dd>');
		expect(res.body).toContain('href="/post.php?fid=2"');
		expect(res.body).not.toContain('misc.php?action=subscribe');
		expect(res.body).not.toContain('moderate.php?fid=2');
		// Le point n'est affiché qu'aux membres, et seulement si o_show_dot est activé.
		expect(res.body).not.toContain('topic-row__dot');
	});

	it('membre : nouveaux messages, mini-pagination, abonnement, point', async () => {
		app = await buildApp(deps({ config: { showDot: true } }));
		const res = await inject(app, { url: '/viewforum.php?id=2', headers: { cookie: sessionCookie(3) } });

		expect(res.body).toContain('/sujet/13?action=new');
		expect(res.body).not.toContain('/sujet/12?action=new');
		// 31 messages à 1 par page : 1 2 … 31
		expect(res.body).toMatch(/<a href="\/sujet\/13-[a-z0-9-]+\/page\/31">31<\/a>/);
		expect(res.body).toContain('misc.php?action=subscribe&amp;fid=2');
		expect(res.body).toContain('misc.php?action=markforumread&amp;fid=2');
		expect(res.body).toContain('topic-row__dot');
	});

	it('modérateur du forum : lien de modération du pied', async () => {
		app = await buildApp(deps());
		const res = await inject(app, { url: '/viewforum.php?id=2', headers: { cookie: sessionCookie(5) } });
		expect(res.body).toContain('moderate.php?fid=2&amp;p=1');
	});

	it('redirige les forums de redirection, 404 si illisible ou inexistant', async () => {
		app = await buildApp(deps({ forumReaders: new Map([[2, [GroupId.Admin]]]) }));
		const redirect = await inject(app, '/viewforum.php?id=3');
		expect(redirect.statusCode).toBe(302);
		expect(redirect.headers.location).toBe('https://example.test/');
		expect((await inject(app, '/viewforum.php?id=2')).statusCode).toBe(404);
		expect((await inject(app, '/viewforum.php?id=abc')).statusCode).toBe(404);
	});

	it('discussions anciennes (o_cold_topic_days) : liste récente, bouton et page des anciennes', async () => {
		const aged = [
			summary(20, { sticky: true, lastPost: { postedAt: NOW - 400 * 86_400, postId: 200, poster: 'admin' } }),
			summary(21),
			summary(22, { lastPost: { postedAt: NOW - 100 * 86_400, postId: 220, poster: 'admin' } }),
			summary(23, { lastPost: { postedAt: NOW - 200 * 86_400, postId: 230, poster: 'admin' } }),
		];
		app = await buildApp(deps({ forumTopics: new Map([[2, aged]]), config: { coldTopicDays: 90 } }));
		const recent = await inject(app, '/viewforum.php?id=2');
		// L'épinglée reste dans la liste, quel que soit son âge.
		expect(recent.body).toContain('href="/sujet/20-');
		expect(recent.body).toContain('href="/sujet/21-');
		expect(recent.body).not.toContain('href="/sujet/22-');
		expect(recent.body).toContain('href="/forum/2-captures-videos?old=1">Anciennes discussions (2)</a>');

		const old = await inject(app, '/viewforum.php?id=2&old=1');
		expect(old.body).toContain('— Anciennes discussions</h1>');
		expect(old.body).toContain('plus de 90 jours');
		expect(old.body).toContain('href="/sujet/22-');
		expect(old.body).toContain('href="/sujet/23-');
		expect(old.body).not.toContain('href="/sujet/20-');
		expect(old.body).toContain('href="/forum/2-captures-videos">Discussions récentes (2)</a>');
		expect(old.body).toContain('<link rel="canonical" href="http://forum.test/forum/2-captures-videos?old=1">');
	});

	it('sans seuil ou sans ancienne discussion : pas de bouton', async () => {
		app = await buildApp(deps());
		expect((await inject(app, '/viewforum.php?id=2')).body).not.toContain('old=1');
		app = await buildApp(deps({ config: { coldTopicDays: 90 }, forumTopics: new Map([[2, [summary(30)]]]) }));
		expect((await inject(app, '/viewforum.php?id=2')).body).not.toContain('old=1');
	});

	it('forum vide et permission de créer des sujets retirée par forum_perms', async () => {
		app = await buildApp(deps({ forumTopics: new Map(), forumInfos: [{ ...forumInfo, topicPermission: false, numTopics: 0 }] }));
		const res = await inject(app, '/viewforum.php?id=2');
		expect(res.body).toContain('Le forum ne contient aucune discussion.');
		expect(res.body).not.toContain('post.php?fid=2');
	});
});
