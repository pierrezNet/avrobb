/**
 * Plugins d'administration (admin_loader.php) : droits AP_/AMP_, plugins non portés redirigés vers
 * le PHP, ajout d'utilisateur du plugin « Gestion d'utilisateur ».
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { GroupId } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { buildLegacyCookie } from '../src/services/legacySession.ts';
import { boardConfig, type FakeData, fakeDeps, group, guest, NOW, viewer } from './fixtures.ts';

const SEED = 'graine-de-test';
const CSRF_SECRET = '9'.repeat(64);
const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true }) });
const admin = viewer({ id: 2, username: 'admin', group: group({ id: GroupId.Admin }) });
const hashes: Record<number, string> = { 5: 'h5', 2: 'h2' };
const cookies = (userId: number): string =>
	`punbb_cookie=${buildLegacyCookie(userId, hashes[userId] ?? '', NOW + 3600, SEED)}; punbb_cookie_csrf=${CSRF_SECRET}`;
const PLUGIN = '/admin_loader.php?plugin=AMP_Gestion_utilisateurs.php';

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

async function start(): Promise<{ server: FastifyInstance; fake: FakeData }> {
	const fake: FakeData = {
		users: [
			{ viewer: guest, passwordHash: '' },
			{ viewer: mod, passwordHash: 'h5' },
			{ viewer: admin, passwordHash: 'h2' },
		],
		topics: [],
		posts: new Map(),
		config: {
			registration: { ...boardConfig.registration, report: true, mailingList: 'admin@example.test' },
		},
	};
	app = await buildApp(fakeDeps(fake));
	return { server: app, fake };
}

const get = (server: FastifyInstance, userId: number, url: string) => server.inject({ url, headers: { cookie: cookies(userId) } });
function post(server: FastifyInstance, userId: number, fields: Record<string, string>) {
	return server.inject({
		method: 'POST',
		url: PLUGIN,
		headers: { cookie: cookies(userId), 'content-type': 'application/x-www-form-urlencoded' },
		payload: new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, userId), ...fields }).toString(),
	});
}

describe('admin_loader.php', () => {
	it('droits : AMP_ pour les modérateurs, AP_ pour les administrateurs ; non portés vers le PHP', async () => {
		const { server } = await start();
		expect((await get(server, 5, PLUGIN)).statusCode).toBe(200);
		expect((await get(server, 5, '/admin_loader.php?plugin=AP_Balises.php')).statusCode).toBe(403);
		expect((await get(server, 2, '/admin_loader.php?plugin=../config.php')).statusCode).toBe(400);
		const legacy = await get(server, 2, '/admin_loader.php?plugin=AP_Balises.php');
		expect(legacy.headers.location).toBe('http://php.test/admin_loader.php?plugin=AP_Balises.php');
	});

	it("ajout d'utilisateur : contrôles, compte, alerte et mot de passe envoyé", async () => {
		const { server, fake } = await start();
		const bad = await post(server, 5, { add_user: '1', username: 'x', email: 'pas-une-adresse', random_pass: '0', password: '123' });
		expect(bad.statusCode).toBe(400);
		expect(fake.createdUsers).toBeUndefined();
		const done = await post(server, 5, { add_user: '1', username: 'Nouveau  Pilote', email: 'NP@example.test', random_pass: '1' });
		expect(done.headers.location).toBe('admin_loader.php?plugin=AMP_Gestion_utilisateurs.php&done=created');
		expect(fake.createdUsers?.[0]).toMatchObject({ username: 'Nouveau Pilote', email: 'np@example.test', groupId: 0 });
		expect(fake.sentMails?.map((mail) => mail.to)).toEqual(['admin@example.test', 'np@example.test']);
	});
});
