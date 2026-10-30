/**
 * Renommée (reputation.php) : règles de vote (services/reputation.ts) et pages de bout en bout
 * avec les doublures.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { GroupId } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { canDeleteReputation, readReason, reputationAccessError, voteError } from '../src/services/reputation.ts';
import { boardConfig, type FakeData, fakeDeps, group, guest, NOW, sessionCookie, viewer } from './fixtures.ts';

const SEED = 'graine-de-test';
const CSRF_SECRET = 'c'.repeat(64);

describe('règles de la renommée', () => {
	const target = { authorId: 5, authorReputationEnabled: true };
	const context = { lastVote: null, timeoutMinutes: 10, now: NOW };

	it('accès : groupe, réglage du forum, choix du membre', () => {
		const config = { ...boardConfig, reputationEnabled: true };
		expect(reputationAccessError(viewer(), config)).toBeNull();
		expect(reputationAccessError(viewer({ group: group({ canUseReputation: false }) }), config)).toBe('groupDisabled');
		expect(reputationAccessError(viewer(), boardConfig)).toBe('disabled');
		expect(reputationAccessError(viewer({ reputationEnabled: false }), config)).toBe('yourDisabled');
	});

	it('vote : ni invité, ni soi-même, délai, et seuil de messages selon le sens', () => {
		expect(voteError(viewer(), target, true, context)).toBeNull();
		expect(voteError(guest, target, true, context)).toBe('guest');
		expect(voteError(viewer({ id: 5 }), target, true, context)).toBe('self');
		expect(voteError(viewer(), { ...target, authorReputationEnabled: false }, true, context)).toBe('userDisabled');
		expect(voteError(viewer(), target, true, { ...context, lastVote: NOW - 120 })).toBe('timeout');
		expect(voteError(viewer(), target, true, { ...context, lastVote: NOW - 601 })).toBeNull();
		const picky = viewer({ numPosts: 12, group: group({ reputationMinusMinPosts: 50 }) });
		expect(voteError(picky, target, true, context)).toBeNull();
		expect(voteError(picky, target, false, context)).toBe('notEnoughPosts');
	});

	it('raison : obligatoire, 400 octets, BBCode nettoyé', () => {
		const options = {
			bbcode: true,
			messageAllCaps: false,
			preparse: { quoteDepth: 3, makeLinks: false, allowLinks: true, indentSpaces: 4, baseUrl: '' },
		};
		expect(readReason('  ', options).errors).toEqual([{ kind: 'noMessage' }]);
		expect(readReason('é'.repeat(201), options).errors).toEqual([{ kind: 'tooLong' }]);
		expect(readReason('Merci [B]beaucoup[/B]', options)).toEqual({ reason: 'Merci [b]beaucoup[/b]', errors: [] });
		expect(canDeleteReputation(viewer({ group: group({ id: GroupId.Moderator }) }))).toBe(true);
		expect(canDeleteReputation(viewer())).toBe(false);
	});
});

const tessy = viewer({ numPosts: 12 });
const admin = viewer({ id: 2, username: 'admin', group: group({ id: GroupId.Admin }) });

function data(overrides: Partial<FakeData> = {}): FakeData {
	return {
		users: [{ viewer: guest }, { viewer: tessy }, { viewer: admin }],
		topics: [],
		posts: new Map(),
		config: { reputationEnabled: true, reputationTimeout: 5 },
		reputationMembers: [{ id: 5, username: 'MaxDUO', plus: 3, minus: 1 }],
		reputationVotes: new Map([
			[
				5,
				[
					{
						id: 41,
						time: NOW - 60,
						reason: 'Super [b]capture[/b]',
						postId: 101,
						subject: 'Postez un « vintage »',
						plus: true,
						from: { id: 3, username: 'Tessy' },
					},
					{ id: 40, time: NOW - 3600, reason: 'Hors sujet', postId: 99, subject: null, plus: false, from: null },
				],
			],
		]),
		reputationTargets: [{ postId: 101, topicId: 10, authorId: 5, authorName: 'MaxDUO', authorReputationEnabled: true }],
		...overrides,
	};
}

const hashes: Record<number, string> = { 3: 'h3', 2: 'h2' };
const cookies = (userId: number): string => `${sessionCookie(userId)}; avrobb_csrf=${CSRF_SECRET}`;

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

function post(server: FastifyInstance, userId: number, url: string, fields: Record<string, string | string[]>) {
	const body = new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, userId) });
	for (const [name, value] of Object.entries(fields)) for (const item of [value].flat()) body.append(name, item);
	return server.inject({
		method: 'POST',
		url,
		headers: { cookie: cookies(userId), 'content-type': 'application/x-www-form-urlencoded' },
		payload: body.toString(),
	});
}

describe('GET /reputation.php', () => {
	it("historique d'un membre : totaux, raisons rendues, votant, discussion supprimée", async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const res = await app.inject({ url: '/reputation.php?uid=5', headers: { cookie: cookies(3) } });
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('Renommée du membre MaxDUO');
		expect(res.body).toContain('[+3 / -1]');
		expect(res.body).toContain('Super <strong>capture</strong>');
		expect(res.body).toContain('href="reputation.php?uid=3">Tessy</a>');
		expect(res.body).toContain('Enlevée ou effacée');
		expect(res.body).toContain('Profil effacé');
		expect(res.body).not.toContain('delete_rep_id');
	});

	it('renommée désactivée : page refusée', async () => {
		app = await buildApp(fakeDeps(data({ config: { reputationEnabled: false } })));
		expect((await app.inject({ url: '/reputation.php?uid=5', headers: { cookie: cookies(3) } })).statusCode).toBe(403);
	});

	it('formulaire de vote, et refus pour soi-même ou un invité', async () => {
		app = await buildApp(fakeDeps(data()));
		const form = await app.inject({ url: '/reputation.php?pid=101&uid=5&method=2', headers: { cookie: cookies(3) } });
		expect(form.body).toContain('Réduction de renommée');
		expect(form.body).toContain('name="pid" value="101"');
		expect((await app.inject({ url: '/reputation.php?pid=101&uid=6&method=1', headers: { cookie: cookies(3) } })).statusCode).toBe(404);
		expect((await app.inject('/reputation.php?pid=101&uid=5&method=1')).statusCode).toBe(403);
	});
});

describe('POST /reputation.php', () => {
	it('enregistre le vote, puis applique le délai entre deux votes', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const res = await post(app, 3, '/reputation.php', { form_sent: '1', pid: '101', method: '1', req_message: 'Bravo !' });
		expect(res.statusCode).toBe(303);
		expect(res.headers.location).toBe('viewtopic.php?pid=101#p101');
		expect(fake.addedVotes).toEqual([{ userId: 5, fromUserId: 3, postId: 101, topicId: 10, reason: 'Bravo !', plus: true, time: NOW }]);

		const again = await post(app, 3, '/reputation.php', { form_sent: '1', pid: '101', method: '1', req_message: 'Encore' });
		expect(again.statusCode).toBe(403);
		expect(again.body).toContain('Veuillez patienter 5 minutes');
	});

	it('raison manquante : formulaire réaffiché', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const res = await post(app, 3, '/reputation.php', { form_sent: '1', pid: '101', method: '2', req_message: '' });
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('Raison requise');
		expect(fake.addedVotes).toBeUndefined();
	});

	it('suppression de votes réservée aux administrateurs et modérateurs', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		expect((await post(app, 3, '/reputation.php?uid=5', { delete_rep: '1', delete_rep_id: '41' })).statusCode).toBe(403);
		const page = await app.inject({ url: '/reputation.php?uid=5', headers: { cookie: cookies(2) } });
		expect(page.body).toContain('name="delete_rep_id" value="41"');
		const res = await post(app, 2, '/reputation.php?uid=5', { delete_rep: '1', delete_rep_id: ['41', '40'] });
		expect(res.headers.location).toBe('reputation.php?uid=5&done=deleted');
		expect(fake.deletedVotes).toEqual([{ userId: 5, ids: [41, 40] }]);
	});
});
