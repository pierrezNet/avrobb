/**
 * Signalements (admin_reports.php) et menu de l'administration.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { GroupId, type Report } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { fr } from '../src/lang/fr/index.ts';
import { buildAdminMenu } from '../src/presenters/adminMenu.ts';
import { boardConfig, type FakeData, fakeDeps, group, guest, NOW, sessionCookie, viewer } from './fixtures.ts';

const SEED = 'graine-de-test';
const CSRF_SECRET = '8'.repeat(64);
const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true }) });
const admin = viewer({ id: 2, username: 'admin', group: group({ id: GroupId.Admin }) });
const hashes: Record<number, string> = { 5: 'h5', 3: 'h3', 2: 'h2' };
const cookies = (userId: number): string => `${sessionCookie(userId)}; avrobb_csrf=${CSRF_SECRET}`;

const report = (id: number, overrides: Partial<Report> = {}): Report => ({
	id,
	created: NOW - 600,
	message: 'Hors sujet\n<b>vraiment</b>',
	reporter: { id: 3, username: 'Tessy' },
	forum: { id: 2, name: 'Captures' },
	topic: { id: 10, subject: 'Vol de nuit' },
	postId: 101,
	zapped: null,
	...overrides,
});

describe('menu de l’administration', () => {
	it('modérateur : menu de modération ; administrateur : tout, sans menu des plugins', () => {
		const forMod = buildAdminMenu(mod, boardConfig, 'reports', fr);
		expect(forMod.moderator.map((i) => i.label)).toEqual(['Accueil', 'Utilisateurs', 'Signalements']);
		expect(forMod.admin).toBeNull();
		const forAdmin = buildAdminMenu(admin, boardConfig, 'index', fr);
		expect(forAdmin.moderator.map((i) => i.href)).toContain('admin_bans.php');
		expect(forAdmin.admin?.map((i) => i.label)).toEqual([
			'Options',
			'Apparence',
			"Pages d'information",
			'Permissions',
			'Catégories',
			'Forums',
			"Groupes d'utilisateurs",
			'Censure',
			'Balises',
			'Messagerie privée',
			'Fichiers des membres',
			'Maintenance',
		]);
	});
});

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

function data(): FakeData {
	return {
		users: [{ viewer: guest }, { viewer: viewer() }, { viewer: mod }, { viewer: admin }],
		topics: [],
		posts: new Map(),
		reportList: [
			report(2),
			report(1, { reporter: null, topic: null, postId: null, zapped: { at: NOW - 60, by: { id: 2, username: 'admin' } } }),
		],
	};
}

describe('admin_reports.php', () => {
	it('réservé aux modérateurs et administrateurs', async () => {
		app = await buildApp(fakeDeps(data()));
		expect((await app.inject('/admin_reports.php')).statusCode).toBe(403);
		expect((await app.inject({ url: '/admin_reports.php', headers: { cookie: cookies(3) } })).statusCode).toBe(403);
	});

	it('liste les nouveaux signalements et les derniers traités, motifs échappés', async () => {
		app = await buildApp(fakeDeps(data()));
		const res = await app.inject({ url: '/admin_reports.php', headers: { cookie: cookies(5) } });
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('Hors sujet<br>&lt;b&gt;vraiment&lt;/b&gt;');
		expect(res.body).toContain('href="viewtopic.php?pid=101#p101">Message n°101</a>');
		expect(res.body).toContain('name="zap_id" value="2"');
		expect(res.body).not.toContain('name="zap_id" value="1"');
		expect(res.body).toContain('Utilisateur supprimé');
		expect(res.body).toContain('par admin');
		expect(res.body).toContain('aria-current="page">Signalements</a>');
	});

	it('marque un signalement comme traité', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const body = new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, 5), zap_id: '2' });
		const res = await app.inject({
			method: 'POST',
			url: '/admin_reports.php',
			headers: { cookie: cookies(5), 'content-type': 'application/x-www-form-urlencoded' },
			payload: body.toString(),
		});
		expect(res.headers.location).toBe('admin_reports.php?done=zapped');
		expect(fake.reportList?.find((r) => r.id === 2)?.zapped).toEqual({ at: NOW, by: { id: 5, username: 'modo' } });
	});
});
