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

describe('plugins de réglages', () => {
	const send = (server: FastifyInstance, plugin: string, fields: Record<string, string>) =>
		server.inject({
			method: 'POST',
			url: `/admin_loader.php?plugin=${plugin}`,
			headers: { cookie: cookies(2), 'content-type': 'application/x-www-form-urlencoded' },
			payload: new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, 2), ...fields }).toString(),
		});

	async function withConfig(values: Record<string, string>) {
		const { server, fake } = await start();
		fake.configValues = new Map(Object.entries(values));
		fake.adminGroups = [
			{ id: 1, title: 'Administrateurs', userTitle: '', values: {} as never },
			{ id: 4, title: 'Membres', userTitle: '', values: {} as never },
		];
		return { server, fake };
	}

	it('sondages : nombre d’options', async () => {
		const { server, fake } = await withConfig({ poll_max_fields: '5' });
		expect((await get(server, 2, '/admin_loader.php?plugin=AP_Sondage.php')).body).toContain('name="max_options" value="5"');
		await send(server, 'AP_Sondage.php', { form_sent: '1', max_options: ' 8 ' });
		expect(fake.configUpdates).toEqual([new Map([['poll_max_fields', '8']])]);
	});

	it('messagerie privée : options, destinataires (+1 comme le PHP) et droits des groupes', async () => {
		const { server, fake } = await withConfig({ o_pms_enabled: '1', o_pms_notification: '0', o_pms_max_receiver: '5' });
		const page = await get(server, 2, '/admin_loader.php?plugin=AP_Private_messaging.php');
		expect(page.body).toContain('name="form[pms_max_receiver]" value="4"');
		expect(page.body).toContain('name="limit[4]" value="20"');
		expect(page.body).not.toContain('name="limit[1]"');
		await send(server, 'AP_Private_messaging.php', {
			'form[pms_enabled]': '1',
			'form[pms_notification]': '1',
			'form[pms_max_receiver]': '9',
			'allow[4]': '0',
			'limit[4]': '50',
		});
		expect(fake.configUpdates).toEqual([
			new Map([
				['o_pms_notification', '1'],
				['o_pms_max_receiver', '10'],
			]),
		]);
		expect(fake.groupAdminLog).toEqual(['pm 4 false 50']);
	});

	it('Plugile : installation, configuration, désinstallation', async () => {
		const { server, fake } = await withConfig({});
		expect((await get(server, 2, '/admin_loader.php?plugin=AP_Plugile.php')).body).toContain('Plugile n&#39;est pas installé.');
		expect((await send(server, 'AP_Plugile.php', { update: '1' })).headers.location).toBe(
			'admin_loader.php?plugin=AP_Plugile.php&done=installed',
		);
		await send(server, 'AP_Plugile.php', { saveconfig: '1', menu: '0', plugile_menu_name: 'Mes <fichiers>' });
		expect(fake.configValues?.get('o_plugile_menu_name')).toBe('Mes &lt;fichiers&gt;');
		expect((await get(server, 2, '/admin_loader.php?plugin=AP_Plugile.php')).body).toContain('value="Mes &lt;fichiers&gt;"');
		await send(server, 'AP_Plugile.php', { delete: '1' });
		expect(fake.configLog).toEqual([
			'replace o_plugile_version,o_plugile_menu,o_plugile_menu_name',
			'replace o_plugile_menu,o_plugile_menu_name',
			'delete o_plugile_version,o_plugile_menu,o_plugile_menu_name',
		]);
	});
});

describe('plugin Premium', () => {
	const send = (server: FastifyInstance, fields: Record<string, string>) =>
		server.inject({
			method: 'POST',
			url: '/admin_loader.php?plugin=AP_Premium.php',
			headers: { cookie: cookies(2), 'content-type': 'application/x-www-form-urlencoded' },
			payload: new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, 2), ...fields }).toString(),
		});

	it('installation, ajout, temps restant, retrait et désinstallation', async () => {
		const { server, fake } = await start();
		expect((await get(server, 2, '/admin_loader.php?plugin=AP_Premium.php')).body).toContain('name="install"');
		await send(server, { install: '1' });
		const page = await get(server, 2, '/admin_loader.php?plugin=AP_Premium.php');
		expect(page.body).toContain('<option value="6" selected>Premium</option>');
		expect((await send(server, { add_user: '1', courriel: 'x@example.test', group_id_premium: '6', end_premium: 'dix' })).statusCode).toBe(
			400,
		);
		expect((await send(server, { add_user: '1', courriel: 'x@ailleurs.test', group_id_premium: '6', end_premium: '3' })).body).toContain(
			'Aucun membre',
		);
		await send(server, { add_user: '1', courriel: 'X@example.test', group_id_premium: '6', end_premium: '3' });
		expect((await get(server, 2, '/admin_loader.php?plugin=AP_Premium.php')).body).toContain('3 jour(s)');
		await send(server, { delete_user: '1', 'delete_prem[9]': '1' });
		expect(fake.premiumMembers).toEqual([]);
		await send(server, { cancel: '1' });
		expect(fake.premiumMembers).toBeUndefined();
	});
});

describe('plugin Uploadile', () => {
	const send = (server: FastifyInstance, fields: Record<string, string>) =>
		server.inject({
			method: 'POST',
			url: '/admin_loader.php?plugin=AP_Uploadile.php',
			headers: { cookie: cookies(2), 'content-type': 'application/x-www-form-urlencoded' },
			payload: new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, 2), ...fields }).toString(),
		});

	it('réglages, installation et suppression ciblée d’un fichier avec recalcul du quota', async () => {
		const { server, fake } = await start();
		fake.config = { ...fake.config, uploads: { ...boardConfig.uploads, extensions: ['png', 'pdf'], thumbnails: true } };
		fake.memberFiles = new Map([
			[
				5,
				[
					{ name: 'plan.pdf', size: 3000, modified: NOW, data: Buffer.from('') },
					{ name: 'vue.png', size: 2000, modified: NOW, data: Buffer.from('') },
					{ name: 'mini_vue.png', size: 100, modified: NOW, data: Buffer.from('') },
				],
			],
			[2, [{ name: 'vue.png', size: 500, modified: NOW, data: Buffer.from('') }]],
		]);
		const page = await get(server, 2, '/admin_loader.php?plugin=AP_Uploadile.php');
		expect(page.body).toContain('name="delete[5/vue.png]"');
		expect(page.body).toContain('mini_vue.png');
		expect(page.body).not.toContain('name="delete[5/mini_vue.png]"');

		await send(server, { supprimer: '1', 'delete[5/vue.png]': '1' });
		expect(fake.memberFiles?.get(5)?.map((f) => f.name)).toEqual(['plan.pdf']);
		expect(fake.memberFiles?.get(2)?.map((f) => f.name)).toEqual(['vue.png']);
		expect(fake.uploadedBytes?.get(5)).toBe(3000);

		await send(server, { update: '1', laws: 'png, jpg', thumb: '0', thumb_size: '-1' });
		expect(fake.configValues?.get('o_uploadile_laws')).toBe('png,jpg');
		expect(fake.configValues?.get('o_uploadile_thumb_size')).toBe('100');
		await send(server, { installation: '1' });
		expect(fake.userActionLog).toEqual(['ensureUploadColumn']);
	});
});
