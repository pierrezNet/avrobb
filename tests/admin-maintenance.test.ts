/**
 * Maintenance (admin_maintenance.php) : reconstruction de l'index par lots en POST et élagage avec
 * confirmation, avec les doublures.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { GroupId } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { buildLegacyCookie } from '../src/services/legacySession.ts';
import { type FakeData, fakeDeps, group, guest, NOW, post, viewer } from './fixtures.ts';

const SEED = 'graine-de-test';
const CSRF_SECRET = '9'.repeat(64);
const admin = viewer({ id: 2, username: 'admin', group: group({ id: GroupId.Admin }) });
const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true }) });
const hashes: Record<number, string> = { 2: 'h2', 5: 'h5' };
const cookies = (userId: number): string =>
	`punbb_cookie=${buildLegacyCookie(userId, hashes[userId] ?? '', NOW + 3600, SEED)}; punbb_cookie_csrf=${CSRF_SECRET}`;

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

async function start(): Promise<{ server: FastifyInstance; fake: FakeData }> {
	const fake: FakeData = {
		users: [
			{ viewer: guest, passwordHash: '' },
			{ viewer: admin, passwordHash: 'h2' },
			{ viewer: mod, passwordHash: 'h5' },
		],
		topics: [],
		posts: new Map([[10, [post(100), post(101), post(102)]]]),
		forumAdmin: {
			categories: [{ id: 1, name: 'Simulateurs', position: 1 }],
			forums: [{ id: 7, name: 'Technique', description: '', redirectUrl: '', numTopics: 3, sortBy: 0, categoryId: 1 }],
			permissions: [],
		},
		prunableCount: 4,
	};
	app = await buildApp(fakeDeps(fake));
	return { server: app, fake };
}

function send(server: FastifyInstance, userId: number, fields: Record<string, string>) {
	return server.inject({
		method: 'POST',
		url: '/admin_maintenance.php',
		headers: { cookie: cookies(userId), 'content-type': 'application/x-www-form-urlencoded' },
		payload: new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, userId), ...fields }).toString(),
	});
}

describe('admin_maintenance.php', () => {
	it('réservé aux administrateurs', async () => {
		const { server } = await start();
		expect((await server.inject({ url: '/admin_maintenance.php', headers: { cookie: cookies(5) } })).statusCode).toBe(403);
		const page = await server.inject({ url: '/admin_maintenance.php', headers: { cookie: cookies(2) } });
		expect(page.body).toContain('name="i_start_at" value="100"');
		expect(page.body).toContain('<option value="7">Simulateurs — Technique</option>');
	});

	it('reconstruit l’index par lots, étape suivante en POST', async () => {
		const { server, fake } = await start();
		const first = await send(server, 2, { action: 'rebuild', i_per_page: '2', i_start_at: '100', i_empty_index: '1' });
		expect(first.body).toContain('name="i_start_at" value="102"');
		expect(first.body).toContain('data-auto-submit');
		const last = await send(server, 2, { action: 'rebuild', i_per_page: '2', i_start_at: '102' });
		expect(last.headers.location).toBe('admin_maintenance.php?done=rebuilt');
		expect(fake.maintenanceLog).toEqual(['empty', 'index 100', 'index 101', 'index 102']);
		expect((await send(server, 2, { action: 'rebuild', i_per_page: '0' })).statusCode).toBe(400);
	});

	it('vidage des caches', async () => {
		const { server, fake } = await start();
		const res = await send(server, 2, { action: 'clear_cache' });
		expect(res.headers.location).toBe('admin_maintenance.php?done=cleared');
		expect(fake.configInvalidations).toBe(1);
	});

	it('élagage : nombre de jours, confirmation puis effet', async () => {
		const { server, fake } = await start();
		expect((await send(server, 2, { action: 'prune', req_prune_days: 'x', prune_from: 'all' })).statusCode).toBe(400);
		const confirm = await send(server, 2, { action: 'prune', req_prune_days: '30', prune_sticky: '0', prune_from: '7' });
		expect(confirm.body).toContain('« Technique » (4 discussions)');
		expect(fake.maintenanceLog).toBeUndefined();
		const done = await send(server, 2, { action: 'prune', prune_comply: '1', prune_days: '30', prune_sticky: '0', prune_from: '7' });
		expect(done.headers.location).toBe('admin_maintenance.php?done=pruned');
		expect(fake.maintenanceLog).toEqual([`prune ${NOW - 30 * 86400} false 7`]);
	});
});
