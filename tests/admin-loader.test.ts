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
import { boardConfig, type FakeData, fakeDeps, group, guest, NOW, topic, viewer } from './fixtures.ts';

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
	it('droits : AMP_ pour les modérateurs, AP_ pour les administrateurs', async () => {
		const { server } = await start();
		expect((await get(server, 5, PLUGIN)).statusCode).toBe(200);
		expect((await get(server, 5, '/admin_loader.php?plugin=AP_Balises.php')).statusCode).toBe(403);
		expect((await get(server, 2, '/admin_loader.php?plugin=../config.php')).statusCode).toBe(400);
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

	it('Sondage, Mod Installer, FluxToolBar, Plugile, Premium et Smilies ne font pas partie d’AvroBB', async () => {
		const { server } = await withConfig({});
		for (const plugin of [
			'AP_Sondage.php',
			'AP_Mod_Installer.php',
			'AP_FluxToolBar.php',
			'AP_Plugile.php',
			'AP_Premium.php',
			'AP_Smilies.php',
		]) {
			expect((await get(server, 2, `/admin_loader.php?plugin=${plugin}`)).statusCode).toBe(400);
		}
		const index = (await get(server, 2, '/admin_index.php')).body;
		expect(index).not.toContain('AP_Sondage.php');
		expect(index).not.toContain('Menu des plugins');
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
});

describe('plugin Uploadile', () => {
	const send = (server: FastifyInstance, fields: Record<string, string>) =>
		server.inject({
			method: 'POST',
			url: '/admin_loader.php?plugin=AP_Uploadile.php',
			headers: { cookie: cookies(2), 'content-type': 'application/x-www-form-urlencoded' },
			payload: new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, 2), ...fields }).toString(),
		});

	it('réglages et suppression ciblée d’un fichier avec recalcul du quota', async () => {
		const { server, fake } = await start();
		fake.config = { ...fake.config, uploads: { ...boardConfig.uploads, extensions: ['png', 'pdf'] } };
		fake.memberFiles = new Map([
			[
				5,
				[
					{ name: 'plan.pdf', size: 3000, modified: NOW, data: Buffer.from('') },
					{ name: 'vue.png', size: 2000, modified: NOW, data: Buffer.from('') },
					{ name: 'mobile_vue.png', size: 100, modified: NOW, data: Buffer.from('') },
				],
			],
			[2, [{ name: 'vue.png', size: 500, modified: NOW, data: Buffer.from('') }]],
		]);
		const page = await get(server, 2, '/admin_loader.php?plugin=AP_Uploadile.php');
		expect(page.body).toContain('name="delete[5/vue.png]"');
		expect(page.body).toContain('mobile_vue.png');
		expect(page.body).not.toContain('name="delete[5/mobile_vue.png]"');
		expect(page.body).not.toContain('miniaturisation');

		await send(server, { supprimer: '1', 'delete[5/vue.png]': '1' });
		expect(fake.memberFiles?.get(5)?.map((f) => f.name)).toEqual(['plan.pdf']);
		expect(fake.memberFiles?.get(2)?.map((f) => f.name)).toEqual(['vue.png']);
		expect(fake.uploadedBytes?.get(5)).toBe(3000);

		await send(server, { update: '1', laws: 'png, jpg', limit_member: '-1' });
		expect(fake.configValues?.get('o_uploadile_laws')).toBe('png,jpg');
		expect(fake.configValues?.get('o_uploadile_limit_member')).toBe('2097152');
		expect(fake.configValues?.has('o_uploadile_thumb')).toBe(false);
		expect((await send(server, { installation: '1' })).statusCode).toBe(400);
	});
});

describe('plugin PunBalise', () => {
	const send = (server: FastifyInstance, query: string, fields: Record<string, string>) =>
		server.inject({
			method: 'POST',
			url: `/admin_loader.php?plugin=AP_Balises.php${query}`,
			headers: { cookie: cookies(2), 'content-type': 'application/x-www-form-urlencoded' },
			payload: new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, 2), ...fields }).toString(),
		});
	const label = {
		id: 1,
		name: 'Réglé',
		color: '#00AA00',
		bold: true,
		italic: false,
		underline: false,
		style: 0,
		moderatorVisible: true,
		position: 2,
	};

	it('liste, ajout, édition et suppression après confirmation', async () => {
		const { server, fake } = await start();
		fake.labelRows = [label, { ...label, id: 2, name: 'Piège', color: 'red;background:url(x)' }];
		const page = await get(server, 2, '/admin_loader.php?plugin=AP_Balises.php');
		expect(page.body).toContain('style="background-color: #00AA00; color: #1a1a1a">Réglé</span>');
		expect(page.body).not.toContain('url(x)');
		expect((await send(server, '&action=add', { nom: 'Réglé', color1: '#000000', baltype: '0' })).body).toContain('déjà utilisé');
		expect((await send(server, '&action=add', { nom: 'Urgent', color1: 'rouge' })).body).toContain('n&#39;est pas valide');
		await send(server, '&action=add', { nom: 'Urgent', color1: '#FF0000', baltype: '2', affich: '1' });
		expect(fake.labelRows?.at(-1)).toMatchObject({ id: 9, name: 'Urgent', style: 2, moderatorVisible: true });
		await send(server, '&action=edit&id=1', { nom: 'Autre', color1: '#123456', position: '5', baltype: '1' });
		expect(fake.labelRows?.[0]).toMatchObject({ name: 'Autre', color: '#123456', position: 5, style: 1, bold: false });
		expect((await send(server, '&action=edit&id=1', { nom: 'Urgent', color1: '#123456', baltype: '2' })).body).toContain('déjà utilisé');
		expect((await get(server, 2, '/admin_loader.php?plugin=AP_Balises.php&action=delete&id=2')).body).toContain('name="delete_comply"');
		await send(server, '&action=delete&id=2', { delete_comply: '1' });
		expect(fake.labelRows?.map((l) => l.id)).toEqual([1, 9]);
	});
});

describe('page Balises : balises du sujet', () => {
	const send = (server: FastifyInstance, query: string, fields: Record<string, string>) =>
		server.inject({
			method: 'POST',
			url: `/admin_loader.php?plugin=AP_Balises.php${query}`,
			headers: { cookie: cookies(2), 'content-type': 'application/x-www-form-urlencoded' },
			payload: new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, 2), ...fields }).toString(),
		});
	const saved = (fake: FakeData) =>
		JSON.parse(fake.configValues?.get('o_subject_tags') ?? '[]') as { name: string; group: string; color: string }[];

	it('liste en pastilles, sans version du mod', async () => {
		const { server } = await start();
		const page = await get(server, 2, '/admin_loader.php?plugin=AP_Balises.php');
		expect(page.body).toContain('style="background-color: #1d4ed8; color: #ffffff">MSFS</span>');
		expect(page.body).not.toContain('Version installée');
	});

	it('ajout, doublon refusé, renommage reporté dans les sujets, ordre et suppression', async () => {
		const { server, fake } = await start();
		fake.configValues = new Map();
		fake.topics = [topic({ id: 10, subject: '[MSFS][Résolu] Vol de nuit' })];
		expect((await send(server, '&action=tag_add', { name: 'msfs', group: 'simulator', color: '#000000' })).body).toContain(
			'porte déjà ce nom',
		);
		await send(server, '&action=tag_add', { name: 'DCS', group: 'simulator', color: '#FF0000' });
		expect(saved(fake).map((t) => t.name)).toContain('DCS');
		const renamed = await send(server, '&action=tag_edit&tag=MSFS', { name: 'MSFS 2024', group: 'simulator', color: '#1d4ed8' });
		expect(renamed.headers.location).toBe('admin_loader.php?plugin=AP_Balises.php&done=tag_renamed_1');
		expect(fake.subjectUpdates).toEqual([{ topicId: 10, subject: '[MSFS 2024][Résolu] Vol de nuit' }]);
		fake.config = { ...fake.config, subjectTags: saved(fake) as never };
		await send(server, '&action=tag_down&tag=MSFS%202024', {});
		expect(saved(fake)[1]?.name).toBe('MSFS 2024');
		fake.config = { ...fake.config, subjectTags: saved(fake) as never };
		await send(server, '&action=tag_delete&tag=DCS', { delete_comply: '1' });
		expect(saved(fake).map((t) => t.name)).not.toContain('DCS');
	});
});
