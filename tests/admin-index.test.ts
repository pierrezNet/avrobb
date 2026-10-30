/**
 * Accueil de l'administration (admin_index.php) et statistiques du serveur (admin_statistics.php).
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { GroupId } from '../src/domain/models.ts';
import { type FakeData, fakeDeps, group, guest, sessionCookie, viewer } from './fixtures.ts';

const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true }) });
const tessy = viewer();
const admin = viewer({ id: 2, username: 'admin', group: group({ id: GroupId.Admin }) });
const cookie = (userId: number): string => `${sessionCookie(userId)}`;

const data = (): FakeData => ({
	users: [{ viewer: guest }, { viewer: mod }, { viewer: tessy }, { viewer: admin }],
	topics: [],
	posts: new Map(),
});

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

const get = async (userId: number | null, url: string) => {
	app = await buildApp(fakeDeps(data()));
	return app.inject({ url, headers: userId !== null ? { cookie: cookie(userId) } : {} });
};

describe('admin_index.php', () => {
	it('réservé aux modérateurs et administrateurs', async () => {
		expect((await get(null, '/admin_index.php')).statusCode).toBe(403);
		expect((await get(3, '/admin_index.php')).statusCode).toBe(403);
		const res = await get(5, '/admin_index.php');
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('Administration du forum');
		expect(res.body).not.toContain('1.5.4');
		expect(res.body).toContain('href="admin_statistics.php"');
	});
});

describe('admin_statistics.php', () => {
	it('charge et membres en ligne pour un modérateur, sans détails du serveur', async () => {
		const res = await get(5, '/admin_statistics.php');
		expect(res.body).toContain('0.50 0.25 0.13 - 4 utilisateur(s) en ligne');
		expect(res.body).not.toContain('MariaDB');
	});

	it('environnement et base de données pour un administrateur', async () => {
		const res = await get(2, '/admin_statistics.php');
		expect(res.body).toContain('Node.js : v24.0.0');
		expect(res.body).toContain('11.4.2-MariaDB');
		expect(res.body).toContain('12');
		expect((await get(3, '/admin_statistics.php')).statusCode).toBe(403);
	});
});
