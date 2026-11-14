/**
 * Réactions sur les messages : effet d'un clic et résumé (services/reactions.ts), barre sous les
 * messages, enregistrement par react.php (formulaire et JSON), liste reactions.php, droits et option.
 */

import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { fr } from '../src/lang/fr/index.ts';
import { NO_REACTIONS, nextReaction, reactorNames, readReaction, topEmojis } from '../src/services/reactions.ts';
import { type FakeData, fakeDeps, guest, post, sessionCookie, topic, viewer } from './fixtures.ts';
import { inject } from './inject.ts';

const SEED = 'graine-de-test';
const CSRF_SECRET = '9'.repeat(64);
const max = viewer({ id: 5, username: 'MaxDUO' });

describe('services/reactions.ts', () => {
	it('une réaction : remplacée par une autre, retirée par la même', () => {
		expect(readReaction('like')).toBe('like');
		expect(readReaction('poop')).toBeNull();
		expect(nextReaction(null, 'like')).toBe('like');
		expect(nextReaction('like', 'sad')).toBe('sad');
		expect(nextReaction('sad', 'sad')).toBeNull();
	});

	it('résumé : émojis les plus fréquents, « vous » d’abord, trois noms puis le nombre restant', () => {
		const reactions = {
			...NO_REACTIONS,
			counts: { like: 6, heart: 1, sad: 2 },
			mine: 'sad' as const,
			reactors: 9,
			recent: ['A', 'B', 'C'],
		};
		expect(topEmojis(reactions)).toEqual(['👍', '😢', '❤️']);
		const { names, others } = reactorNames(reactions, 'Vous');
		expect(fr.topic.reactorsSummary(names, others)).toBe('Vous, A, B et 6 autres');
		expect(fr.topic.reactorsSummary(['A', 'B'], 0)).toBe('A et B');
		expect(fr.topic.reactorsSummary(['A'], 1)).toBe('A et 1 autre');
	});
});

function start(config: NonNullable<FakeData['config']> = {}) {
	const fake: FakeData = {
		users: [
			{ viewer: guest },
			{ viewer: viewer({ id: 2, username: 'admin' }) },
			{ viewer: viewer() },
			{ viewer: max },
			{ viewer: viewer({ id: 6, username: 'Sam' }) },
		],
		topics: [topic({ id: 4 })],
		// Message 40 de Tessy (n° 3).
		posts: new Map([[4, [post(40)]]]),
		reactions: [
			{ postId: 40, userId: 2, reaction: 'laugh' },
			{ postId: 40, userId: 6, reaction: 'like' },
		],
		config,
	};
	return { fake, app: buildApp(fakeDeps(fake)) };
}

const react = async (app: ReturnType<typeof start>['app'], userId: number, fields: Record<string, string>, accept = 'text/html') =>
	inject(await app, {
		method: 'POST',
		url: '/reagir',
		headers: {
			cookie: `${sessionCookie(userId)}; avrobb_csrf=${CSRF_SECRET}`,
			'content-type': 'application/x-www-form-urlencoded',
			accept,
		},
		payload: new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, userId), ...fields }).toString(),
	});

describe('react.php', () => {
	it('barre : résumé et palette pour un autre membre ; résumé seul pour l’invité et l’auteur', async () => {
		const { app } = start();
		const member = (await inject(await app, { url: '/sujet/4', headers: { cookie: sessionCookie(5) } })).body;
		expect(member).toContain('<a class="reaction-summary" href="/reactions?pid=40" data-reactors');
		expect(member).toContain(
			'<span class="reaction-summary__emojis" aria-hidden="true">👍😂</span> <span class="reaction-summary__names">Sam et admin</span>',
		);
		expect(member).toContain('<form class="reaction-bar__form" method="post" action="/reagir"');
		expect(member).toContain(
			'<span class="reaction-picker__current" aria-hidden="true">😊</span> <span class="reaction-picker__label">Réagir</span>',
		);
		expect(member).toContain('value="like" aria-pressed="false" title="J’aime"');
		expect(member).toContain('value="sad" aria-pressed="false" title="Triste"');
		// « Partager » : lien du message, copié par share.js.
		expect(member).toContain(
			'<li class="postshare"><a href="/message/40#p40" data-share data-copied="Lien du message copié dans le presse-papiers.">Partager</a></li>',
		);
		for (const cookie of [undefined, sessionCookie(3)]) {
			const page = (await inject(await app, { url: '/sujet/4', headers: cookie !== undefined ? { cookie } : {} })).body;
			expect(page).not.toContain('reaction-bar__form');
			expect(page).toContain('reaction-summary__names');
		}
	});

	it('sans JavaScript : enregistré, retour au message ; avec : barre recalculée en JSON', async () => {
		const { app, fake } = start();
		const res = await react(app, 5, { pid: '40', value: 'like' });
		expect(res.statusCode).toBe(302);
		expect(res.headers.location).toMatch(/^\/[^.]+#p40$/);
		const view = JSON.parse((await react(app, 5, { pid: '40', value: 'sad' }, 'application/json')).body);
		expect(view.summary).toEqual({ emojis: '👍😂😢', text: 'Vous, Sam et admin' });
		expect(view.picker).toMatchObject({ emoji: '😢', label: 'Triste', pressed: true });
		// Même réaction : retirée.
		await react(app, 5, { pid: '40', value: 'sad' });
		expect(fake.reactions?.filter((row) => row.userId === 5)).toEqual([]);
	});

	it('refusé : son propre message, invité, message inconnu, valeur inconnue, réactions désactivées', async () => {
		const { app, fake } = start();
		expect((await react(app, 3, { pid: '40', value: 'like' })).statusCode).toBe(403);
		expect((await react(app, 1, { pid: '40', value: 'like' })).statusCode).toBe(403);
		expect((await react(app, 5, { pid: '99', value: 'like' })).statusCode).toBe(404);
		expect((await react(app, 5, { pid: '40', value: 'poop' })).statusCode).toBe(400);
		expect(fake.reactions).toHaveLength(2);
		const off = start({ postReactions: false });
		expect((await react(off.app, 5, { pid: '40', value: 'like' })).statusCode).toBe(400);
		expect((await inject(await off.app, { url: '/sujet/4', headers: { cookie: sessionCookie(5) } })).body).not.toContain('reaction-bar');
	});
});

describe('reactions.php', () => {
	it('titre avec le numéro du message, onglets par réaction, filtre ; lisible par un invité', async () => {
		const { app } = start();
		const page = await inject(await app, '/reactions?pid=40');
		expect(page.statusCode).toBe(200);
		expect(page.body).toContain('<h1 class="page-title reactors__title">Membres ayant réagi au message #1</h1>');
		expect(page.body).toContain(
			'<a class="reactors__tab" href="/reactions?pid=40" aria-current="page">Tous <span class="reactors__count">2</span></a>',
		);
		expect(page.body).toContain('href="/reactions?pid=40&amp;r=laugh"><span aria-hidden="true">😂</span>');
		expect(page.body.match(/class="reactors__row"/g)).toHaveLength(2);
		const likes = (await inject(await app, '/reactions?pid=40&r=like')).body;
		expect(likes.match(/class="reactors__row"/g)).toHaveLength(1);
		expect(likes).toContain('<a href="/membre/6">Sam</a>');
		expect((await inject(await app, '/reactions?pid=40&r=poop')).statusCode).toBe(404);
		expect((await inject(await app, '/reactions?pid=99')).statusCode).toBe(404);
	});
});

describe('accueil : messages les plus appréciés', () => {
	const appreciated = {
		postId: 40,
		topicId: 4,
		subject: 'Premier sujet',
		poster: 'Tessy',
		message: 'Un vol [b]superbe[/b] au-dessus des Alpes',
		score: 3,
	};

	it('extrait, auteur, discussion et total ; masqué quand les deux fonctions sont désactivées', async () => {
		const data = (config: NonNullable<FakeData['config']>): FakeData => ({
			users: [{ viewer: guest }],
			topics: [],
			posts: new Map(),
			appreciatedPosts: [appreciated],
			config,
		});
		const home = await inject(await buildApp(fakeDeps(data({}))), '/');
		expect(home.body).toContain('<h2 class="home-block__title" id="appreciated-title">Messages les plus appréciés</h2>');
		expect(home.body).toContain('>Un vol superbe au-dessus des Alpes</a>');
		expect(home.body).toContain('Tessy · Premier sujet');
		expect(home.body).toContain('3 J’aime et réactions cette semaine');
		const off = await inject(await buildApp(fakeDeps(data({ postReactions: false }))), '/');
		expect(off.body).not.toContain('appreciated-title');
	});
});
