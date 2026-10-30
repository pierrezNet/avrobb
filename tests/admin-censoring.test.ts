/**
 * Mots censurés (admin_censoring.php) de bout en bout avec les doublures.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { GroupId } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { type FakeData, fakeDeps, group, guest, NOW, sessionCookie, viewer } from './fixtures.ts';

const SEED = 'graine-de-test';
const CSRF_SECRET = '9'.repeat(64);
const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true }) });
const admin = viewer({ id: 2, username: 'admin', group: group({ id: GroupId.Admin }) });
const hashes: Record<number, string> = { 5: 'h5', 2: 'h2' };
const cookies = (userId: number): string => `${sessionCookie(userId)}; avrobb_csrf=${CSRF_SECRET}`;

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

async function start(): Promise<{ server: FastifyInstance; fake: FakeData; invalidated: string[] }> {
	const fake: FakeData = {
		users: [{ viewer: guest }, { viewer: mod }, { viewer: admin }],
		topics: [],
		posts: new Map(),
		censoredWords: [{ searchFor: 'zut', replaceWith: '***' }],
	};
	const invalidated: string[] = [];
	app = await buildApp(
		fakeDeps(fake, {
			phpCache: {
				version: async () => null,
				read: async () => null,
				invalidate: async (name) => void invalidated.push(name),
				invalidateFamily: async () => {},
			},
		}),
	);
	return { server: app, fake, invalidated };
}

function post(server: FastifyInstance, fields: Record<string, string>) {
	return server.inject({
		method: 'POST',
		url: '/admin_censoring.php',
		headers: { cookie: cookies(2), 'content-type': 'application/x-www-form-urlencoded' },
		payload: new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, 2), ...fields }).toString(),
	});
}

describe('admin_censoring.php', () => {
	it('réservé aux administrateurs ; ajout, modification, suppression et cache PHP', async () => {
		const { server, fake, invalidated } = await start();
		expect((await server.inject({ url: '/admin_censoring.php', headers: { cookie: cookies(5) } })).statusCode).toBe(403);
		const page = await server.inject({ url: '/admin_censoring.php', headers: { cookie: cookies(2) } });
		expect(page.body).toContain('name="search_for[1]" value="zut"');
		expect((await post(server, { add_word: '1', new_search_for: ' ' })).statusCode).toBe(400);
		await post(server, { add_word: '1', new_search_for: ' flûte ', new_replace_with: 'f***' });
		await post(server, { 'update[1]': '1', 'search_for[1]': 'zut*', 'replace_with[1]': '!!!' });
		const removed = await post(server, { 'remove[2]': '1' });
		expect(removed.headers.location).toBe('admin_censoring.php?done=removed');
		expect(fake.censoredWords).toEqual([{ searchFor: 'zut*', replaceWith: '!!!' }]);
		expect(invalidated).toEqual(['censoring', 'censoring', 'censoring']);
	});
});
