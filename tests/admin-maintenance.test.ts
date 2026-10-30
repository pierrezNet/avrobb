/**
 * Maintenance (admin_maintenance.php) : reconstruction de l'index par lots en POST et élagage avec
 * confirmation, avec les doublures.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { GroupId } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { type FakeData, fakeDeps, group, guest, NOW, post, sessionCookie, viewer } from './fixtures.ts';

const SEED = 'graine-de-test';
const CSRF_SECRET = '9'.repeat(64);
const admin = viewer({ id: 2, username: 'admin', group: group({ id: GroupId.Admin }) });
const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true }) });
const hashes: Record<number, string> = { 2: 'h2', 5: 'h5' };
const cookies = (userId: number): string => `${sessionCookie(userId)}; avrobb_csrf=${CSRF_SECRET}`;

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

async function start(): Promise<{ server: FastifyInstance; fake: FakeData }> {
	const fake: FakeData = {
		users: [{ viewer: guest }, { viewer: admin }, { viewer: mod }],
		topics: [],
		posts: new Map([[10, [post(100), post(101), post(102)]]]),
		forumAdmin: {
			categories: [{ id: 1, name: 'Simulateurs', position: 1 }],
			forums: [{ id: 7, name: 'Technique', description: '', redirectUrl: '', numTopics: 3, sortBy: 0, categoryId: 1 }],
			permissions: [],
		},
	};
	app = await buildApp(fakeDeps(fake));
	return { server: app, fake };
}

const get = (server: FastifyInstance, userId: number, url: string) => server.inject({ url, headers: { cookie: cookies(userId) } });

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
		expect(page.body).toContain('id="cold-topics"');
		expect(page.body).not.toContain('prune');
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

	it('mode maintenance : réglage, aperçu et page vue par les membres', async () => {
		const { server, fake } = await start();
		fake.configValues = new Map([
			['o_maintenance', '0'],
			['o_maintenance_message', 'Fermé'],
		]);
		const page = await get(server, 2, '/admin_maintenance.php');
		expect(page.body).toContain('id="maintenance-mode"');
		expect(page.body).toContain('href="admin_maintenance.php?preview=1"');

		const saved = await send(server, 2, { action: 'mode', maintenance: '1', maintenance_message: '<b>Pause</b>' });
		expect(saved.headers.location).toBe('admin_maintenance.php?done=mode#maintenance-mode');
		expect(fake.configValues?.get('o_maintenance')).toBe('1');
		expect(fake.configValues?.get('o_maintenance_message')).toBe('<b>Pause</b>');
		expect((await send(server, 5, { action: 'mode', maintenance: '1' })).statusCode).toBe(403);

		fake.config = { ...fake.config, maintenance: true, maintenanceMessage: '<b>Pause</b>' };
		const preview = await get(server, 2, '/admin_maintenance.php?preview=1');
		expect(preview.body).toContain('<b>Pause</b>');
		expect(preview.body).toContain('Aperçu');
		expect((await get(server, 2, '/index.php')).body).toContain('href="admin_maintenance.php#maintenance-mode"');
		const blocked = await server.inject({ url: '/index.php' });
		expect(blocked.statusCode).toBe(503);
		expect(blocked.body).not.toContain('Aperçu');
	});

	it('discussions anciennes : seuil enregistré (REPLACE), saisie invalide refusée', async () => {
		const { server, fake } = await start();
		expect((await send(server, 2, { action: 'cold', cold_days: 'x' })).statusCode).toBe(400);
		const saved = await send(server, 2, { action: 'cold', cold_days: '090' });
		expect(saved.headers.location).toBe('admin_maintenance.php?done=cold#cold-topics');
		expect(fake.configValues?.get('o_cold_topic_days')).toBe('90');
		expect(fake.configLog).toEqual(['replace o_cold_topic_days']);
		expect((await send(server, 5, { action: 'cold', cold_days: '30' })).statusCode).toBe(403);
	});
});
