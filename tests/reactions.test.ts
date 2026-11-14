/**
 * « J'aime » et réactions : effet d'un clic (services/reactions.ts), boutons sous les messages,
 * enregistrement par react.php (formulaire et JSON), droits et options.
 */

import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { NO_REACTIONS, nextReaction, readReactionChoice } from '../src/services/reactions.ts';
import { type FakeData, fakeDeps, guest, post, sessionCookie, topic, viewer } from './fixtures.ts';
import { inject } from './inject.ts';

const SEED = 'graine-de-test';
const CSRF_SECRET = '9'.repeat(64);
const max = viewer({ id: 5, username: 'MaxDUO' });

describe('nextReaction()', () => {
	it('le « J’aime » s’ajoute ou se retire ; une seule réaction, remplacée ou retirée', () => {
		const like = readReactionChoice('like');
		const heart = readReactionChoice('heart');
		const party = readReactionChoice('party');
		if (like === null || heart === null || party === null) throw new Error('choix inconnu');
		expect(readReactionChoice('poop')).toBeNull();
		expect(nextReaction(NO_REACTIONS, like)).toEqual({ liked: true, reaction: null });
		const loved = { ...NO_REACTIONS, liked: true, reaction: 'heart' as const };
		expect(nextReaction(loved, like)).toEqual({ liked: false, reaction: 'heart' });
		expect(nextReaction(loved, party)).toEqual({ liked: true, reaction: 'party' });
		expect(nextReaction(loved, heart)).toEqual({ liked: true, reaction: null });
	});
});

function start(config: NonNullable<FakeData['config']> = {}) {
	const fake: FakeData = {
		users: [{ viewer: guest }, { viewer: viewer() }, { viewer: max }],
		topics: [topic({ id: 4 })],
		// Message 40 de Tessy (n° 3).
		posts: new Map([[4, [post(40)]]]),
		reactions: [{ postId: 40, userId: 3, slot: 'emoji', reaction: 'laugh' }],
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
	it('boutons pour un autre membre ; compteurs seuls pour l’invité et l’auteur', async () => {
		const { app } = start();
		const member = await inject(await app, { url: '/sujet/4', headers: { cookie: sessionCookie(5) } });
		expect(member.body).toContain('<form class="reactions" method="post" action="/reagir"');
		expect(member.body).toContain('name="value" value="like" aria-pressed="false" title="J’aime"');
		expect(member.body).toMatch(/value="laugh" aria-pressed="false" title="Drôle">.*<span class="reaction__count">1<\/span>/);
		for (const cookie of [undefined, sessionCookie(3)]) {
			const page = await inject(await app, { url: '/sujet/4', headers: cookie !== undefined ? { cookie } : {} });
			expect(page.body).not.toContain('<form class="reactions"');
			expect(page.body).toContain('<li class="reaction" title="Drôle">');
			expect(page.body).not.toContain('title="J’aime"');
		}
	});

	it('sans JavaScript : enregistré, retour au message ; avec : compteurs en JSON', async () => {
		const { app, fake } = start();
		const res = await react(app, 5, { pid: '40', value: 'like' });
		expect(res.statusCode).toBe(302);
		expect(res.headers.location).toMatch(/^\/[^.]+#p40$/);
		const json = await react(app, 5, { pid: '40', value: 'laugh' }, 'application/json');
		expect(JSON.parse(json.body)).toEqual({ likes: 1, reactions: { laugh: 2 }, liked: true, reaction: 'laugh' });
		// Même réaction : retirée ; autre réaction : remplace la précédente.
		await react(app, 5, { pid: '40', value: 'laugh' });
		await react(app, 5, { pid: '40', value: 'party' });
		expect(fake.reactions?.filter((row) => row.userId === 5)).toEqual([
			{ postId: 40, userId: 5, slot: 'like', reaction: 'like' },
			{ postId: 40, userId: 5, slot: 'emoji', reaction: 'party' },
		]);
	});

	it('refusé : son propre message, invité, message inconnu, valeur ou fonction désactivée', async () => {
		const { app, fake } = start({ postReactions: false });
		expect((await react(app, 3, { pid: '40', value: 'like' })).statusCode).toBe(403);
		expect((await react(app, 1, { pid: '40', value: 'like' })).statusCode).toBe(403);
		expect((await react(app, 5, { pid: '99', value: 'like' })).statusCode).toBe(404);
		expect((await react(app, 5, { pid: '40', value: 'poop' })).statusCode).toBe(400);
		expect((await react(app, 5, { pid: '40', value: 'heart' })).statusCode).toBe(400);
		expect(fake.reactions).toHaveLength(1);
		// Réactions désactivées : plus de compteur de réaction affiché.
		const page = await inject(await app, { url: '/sujet/4', headers: { cookie: sessionCookie(5) } });
		expect(page.body).toContain('value="like"');
		expect(page.body).not.toContain('value="laugh"');
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
		const off = await inject(await buildApp(fakeDeps(data({ postLikes: false, postReactions: false }))), '/');
		expect(off.body).not.toContain('appreciated-title');
	});
});
