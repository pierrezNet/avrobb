/**
 * Bannissements (admin_bans.php) : validation (services/banForm.ts) et pages de bout en bout avec les
 * doublures.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { GroupId } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { normalizeBanIps, readBanForm } from '../src/services/banForm.ts';
import { type FakeData, fakeDeps, group, guest, NOW, sessionCookie, viewer } from './fixtures.ts';

const SEED = 'graine-de-test';
const CSRF_SECRET = '9'.repeat(64);
const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true }) });
const banMod = viewer({ id: 6, username: 'Garde', group: group({ id: 6, isModerator: true, canModBanUsers: true }) });
const tessy = viewer();
const admin = viewer({ id: 2, username: 'admin', group: group({ id: GroupId.Admin }) });
const hashes: Record<number, string> = { 5: 'h5', 6: 'h6', 3: 'h3', 2: 'h2' };
const cookies = (userId: number): string => `${sessionCookie(userId)}; avrobb_csrf=${CSRF_SECRET}`;

describe('formulaire de bannissement', () => {
	it('adresses et plages IP normalisées comme le PHP', () => {
		expect(normalizeBanIps('192.000.2.05  10.1')).toBe('192.0.2.5 10.1');
		expect(normalizeBanIps('2001:0db8::0001')).toBe('2001:db8::1');
		expect(normalizeBanIps('256.1.1.1')).toBeNull();
		expect(normalizeBanIps('1.2.3.4.5')).toBeNull();
	});

	it('au moins un critère, pas l’invité, e-mail ou domaine, date future', () => {
		const read = (values: Record<string, string>) => (name: string) => values[name] ?? '';
		expect(readBanForm(read({}), 0, NOW)).toEqual({ kind: 'error', error: 'mustEnter' });
		expect(readBanForm(read({ ban_user: 'Guest' }), 0, NOW)).toEqual({ kind: 'error', error: 'guest' });
		expect(readBanForm(read({ ban_email: 'pas valide' }), 0, NOW)).toEqual({ kind: 'error', error: 'invalidEmail' });
		expect(readBanForm(read({ ban_email: 'Spam.fr' }), 0, NOW)).toMatchObject({ kind: 'ok', ban: { email: 'spam.fr' } });
		expect(readBanForm(read({ ban_user: 'Tessy', ban_expire: '2000-01-01' }), 0, NOW)).toEqual({ kind: 'error', error: 'invalidDate' });
	});
});

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

async function start(): Promise<{ server: FastifyInstance; fake: FakeData }> {
	const fake: FakeData = {
		users: [{ viewer: guest }, { viewer: mod }, { viewer: banMod }, { viewer: tessy }, { viewer: admin }],
		topics: [],
		posts: new Map(),
		bans: [{ id: 4, username: 'Troll', ip: '', email: '', message: 'Au revoir', expire: null }],
	};
	app = await buildApp(fakeDeps(fake));
	return { server: app, fake };
}

const get = (server: FastifyInstance, userId: number, url: string) => server.inject({ url, headers: { cookie: cookies(userId) } });
function post(server: FastifyInstance, userId: number, url: string, fields: Record<string, string>) {
	return server.inject({
		method: 'POST',
		url,
		headers: { cookie: cookies(userId), 'content-type': 'application/x-www-form-urlencoded' },
		payload: new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, userId), ...fields }).toString(),
	});
}

describe('admin_bans.php', () => {
	it('administrateurs et modérateurs autorisés à bannir seulement', async () => {
		const { server } = await start();
		expect((await get(server, 5, '/admin_bans.php')).statusCode).toBe(403);
		expect((await get(server, 6, '/admin_bans.php')).statusCode).toBe(200);
	});

	it('ajout depuis un profil : compte seul par défaut, dernière IP proposée par une case ; modérateurs protégés', async () => {
		const { server, fake } = await start();
		const form = await get(server, 6, '/admin_bans.php?add_ban=3');
		expect(form.body).toContain('name="ban_user" value="Tessy"');
		expect(form.body).toContain('name="ban_ip" value=""');
		expect(form.body).toContain('name="ban_last_ip" value="192.0.2.5"');
		expect(form.body).not.toMatch(/name="ban_last_ip"[^>]*checked/);
		expect((await get(server, 6, '/admin_bans.php?add_ban=5')).body).toContain('est un modérateur');

		const userOnly = await post(server, 6, '/admin_bans.php', { add_edit_ban: '1', mode: 'add', ban_user: 'Tessy' });
		expect(userOnly.headers.location).toBe('admin_bans.php?done=added');
		const withIp = await post(server, 6, '/admin_bans.php', {
			add_edit_ban: '1',
			mode: 'add',
			ban_user: 'Tessy',
			ban_ip: '10.1',
			ban_last_ip: '192.0.2.5',
		});
		expect(withIp.headers.location).toBe('admin_bans.php?done=added');
		const ipOnly = await post(server, 6, '/admin_bans.php', { add_edit_ban: '1', mode: 'add', ban_ip: '198.51.100.7' });
		expect(ipOnly.headers.location).toBe('admin_bans.php?done=added');
		expect(fake.banLog).toEqual([
			'add {"username":"Tessy","ip":null,"email":null,"message":null,"expire":null} by 6',
			'add {"username":"Tessy","ip":"10.1 192.0.2.5","email":null,"message":null,"expire":null} by 6',
			'add {"username":null,"ip":"198.51.100.7","email":null,"message":null,"expire":null} by 6',
		]);
		const refused = await post(server, 6, '/admin_bans.php', { add_edit_ban: '1', mode: 'add', ban_user: 'admin' });
		expect(refused.statusCode).toBe(400);
	});

	it('modification, recherche et suppression en POST après confirmation', async () => {
		const { server, fake } = await start();
		expect((await get(server, 2, '/admin_bans.php?edit_ban=4')).body).toContain('name="ban_message" value="Au revoir"');
		await post(server, 2, '/admin_bans.php', { add_edit_ban: '1', mode: 'edit', ban_id: '4', ban_user: 'Troll', ban_message: 'Non' });
		const results = await get(server, 2, '/admin_bans.php?find_ban=&form%5Busername%5D=Tr*');
		expect(results.body).toContain('href="admin_bans.php?del_ban=4"');
		expect((await get(server, 2, '/admin_bans.php?del_ban=4')).body).toContain('name="del_ban_comply"');
		await post(server, 2, '/admin_bans.php?del_ban=4', { del_ban_comply: '1' });
		expect(fake.banLog).toEqual(['update 4 {"username":"Troll","ip":null,"email":null,"message":"Non","expire":null}', 'remove 4']);
	});
});
