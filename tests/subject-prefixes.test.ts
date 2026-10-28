/**
 * Préfixes du sujet (PV) : réécriture du sujet (services/subjectPrefixes.ts), droit de l'auteur et des
 * modérateurs, page topic_prefixes.php et lien depuis viewtopic.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { GroupId } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { buildLegacyCookie } from '../src/services/legacySession.ts';
import { applyPrefixes, splitPrefixes } from '../src/services/subjectPrefixes.ts';
import { type FakeData, fakeDeps, group, guest, NOW, post, topic, viewer } from './fixtures.ts';

const SEED = 'graine-de-test';
const CSRF_SECRET = '9'.repeat(64);
const author = viewer();
const other = viewer({ id: 7, username: 'Autre' });
const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true }) });
const hashes: Record<number, string> = { 3: 'h3', 7: 'h7', 5: 'h5' };
const cookies = (userId: number): string =>
	`punbb_cookie=${buildLegacyCookie(userId, hashes[userId] ?? '', NOW + 3600, SEED)}; punbb_cookie_csrf=${CSRF_SECRET}`;

describe('réécriture du sujet', () => {
	it('repère les préfixes connus en tête, quelle que soit la casse', () => {
		expect(splitPrefixes('[msfs] [Résolu]Panne moteur')).toEqual({ prefixes: ['MSFS', 'Résolu'], rest: 'Panne moteur' });
		expect(splitPrefixes('[Inconnu] Titre')).toEqual({ prefixes: [], rest: '[Inconnu] Titre' });
	});

	it('remet les préfixes choisis dans l’ordre des listes, retire les autres', () => {
		expect(applyPrefixes('[Résolu]Panne moteur', ['Résolu', 'MSFS'])).toBe('[MSFS][Résolu] Panne moteur');
		expect(applyPrefixes('[MSFS] [Résolu] Panne moteur', [])).toBe('Panne moteur');
	});
});

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

async function start(): Promise<{ server: FastifyInstance; fake: FakeData }> {
	const fake: FakeData = {
		users: [
			{ viewer: guest, passwordHash: '' },
			{ viewer: author, passwordHash: 'h3' },
			{ viewer: other, passwordHash: 'h7' },
			{ viewer: mod, passwordHash: 'h5' },
		],
		topics: [
			topic({
				id: 10,
				subject: '[MSFS] Vol de nuit',
				posterId: 3,
				forum: { id: 2, name: 'Captures', moderators: new Map([['MaxDUO', 5]]) },
			}),
		],
		posts: new Map([[10, [post(100, { message: 'Décollage de nuit' })]]]),
	};
	app = await buildApp(fakeDeps(fake));
	return { server: app, fake };
}

const get = (server: FastifyInstance, userId: number, url: string) => server.inject({ url, headers: { cookie: cookies(userId) } });
const send = (server: FastifyInstance, userId: number, fields: Record<string, string>) =>
	server.inject({
		method: 'POST',
		url: '/topic_prefixes.php?id=10',
		headers: { cookie: cookies(userId), 'content-type': 'application/x-www-form-urlencoded' },
		payload: new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, userId), ...fields }).toString(),
	});

describe('topic_prefixes.php', () => {
	it('lien sur viewtopic pour l’auteur et les modérateurs seulement', async () => {
		const { server } = await start();
		expect((await get(server, 3, '/viewtopic.php?id=10')).body).toContain('href="topic_prefixes.php?id=10"');
		expect((await get(server, 5, '/viewtopic.php?id=10')).body).toContain('href="topic_prefixes.php?id=10"');
		expect((await get(server, 7, '/viewtopic.php?id=10')).body).not.toContain('topic_prefixes.php');
		expect((await get(server, 7, '/topic_prefixes.php?id=10')).statusCode).toBe(403);
	});

	it('l’auteur coche et décoche des préfixes, sans délai', async () => {
		const { server, fake } = await start();
		const form = await get(server, 3, '/topic_prefixes.php?id=10');
		expect(form.body).toContain('name="prefix[MSFS]" value="1" checked');
		expect(form.body).toContain('name="prefix[Résolu]" value="1">');
		const res = await send(server, 3, { 'prefix[MSFS]': '1', 'prefix[Résolu]': '1' });
		expect(res.headers.location).toBe('viewtopic.php?id=10');
		expect(fake.subjectUpdates).toEqual([{ topicId: 10, subject: '[MSFS][Résolu] Vol de nuit' }]);
	});

	it('refuse un sujet trop long et n’écrit rien si rien ne change', async () => {
		const { server, fake } = await start();
		const topicRow = fake.topics[0];
		if (topicRow !== undefined) topicRow.subject = `[MSFS] ${'x'.repeat(60)}`;
		expect((await send(server, 5, { 'prefix[MSFS]': '1', 'prefix[MULTI-SIMU]': '1' })).statusCode).toBe(400);
		await send(server, 5, { 'prefix[MSFS]': '1' });
		expect(fake.subjectUpdates).toBeUndefined();
	});
});
