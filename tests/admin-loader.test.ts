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
		const legacy = await get(server, 2, '/admin_loader.php?plugin=AP_FluxToolBar.php');
		expect(legacy.headers.location).toBe('http://php.test/admin_loader.php?plugin=AP_FluxToolBar.php');
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

describe('plugin Smilies', () => {
	const send = (server: FastifyInstance, fields: Record<string, string>) =>
		server.inject({
			method: 'POST',
			url: '/admin_loader.php?plugin=AP_Smilies.php',
			headers: { cookie: cookies(2), 'content-type': 'application/x-www-form-urlencoded' },
			payload: new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, 2), ...fields }).toString(),
		});

	it('modification, codes uniques, retrait, ajout et images utilisées protégées', async () => {
		const { server, fake } = await start();
		fake.smileyRows = [
			{ id: 1, text: ':)', image: 'smile.png', position: 0 },
			{ id: 2, text: ':(', image: 'sad.png', position: 1 },
		];
		fake.smileyImageNames = ['sad.png', 'smile.png', 'wink.png'];
		const page = await get(server, 2, '/admin_loader.php?plugin=AP_Smilies.php');
		expect(page.body).toContain('<option value="smile.png" selected>smile.png</option>');
		const dup = await send(server, { reord: '1', 'smilies_code[1]': ':)', 'smilies_code[2]': ':)' });
		expect(dup.body).toContain('Impossible de dupliquer le code :)');
		await send(server, {
			reord: '1',
			'smilies_code[1]': ':-)',
			'smilies_img[1]': 'wink.png',
			'smilies_order[1]': '3',
			'smilies_code[2]': ':(',
		});
		expect(fake.smileyRows[0]).toEqual({ id: 1, text: ':-)', image: 'wink.png', position: 3 });
		expect((await send(server, { delete: '1', 'del_smilies[wink.png]': '1' })).body).toContain('utilisées : wink.png');
		await send(server, { delete: '1', 'del_smilies[smile.png]': '1' });
		expect(fake.smileyImageNames).toEqual(['sad.png', 'wink.png']);
		await send(server, { remove: '1', 'rem_smilies[2]': '1' });
		expect((await send(server, { add_smiley: '1', smiley_code: ':-)', smiley_image: 'sad.png' })).body).toContain(
			'Le code texte existe déjà.',
		);
		await send(server, { add_smiley: '1', smiley_code: ';)', smiley_image: 'sad.png' });
		expect(fake.smileyRows?.map((row) => row.text)).toEqual([':-)', ';)']);
	});
});

describe('plugin Smilies : envoi d’image', () => {
	const png = (width: number, height: number): Buffer => {
		const data = Buffer.alloc(33);
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(data);
		data.writeUInt32BE(13, 8);
		data.write('IHDR', 12, 'latin1');
		data.writeUInt32BE(width, 16);
		data.writeUInt32BE(height, 20);
		return data;
	};
	async function upload(server: FastifyInstance, name: string, content: Buffer) {
		const form = new FormData();
		form.append('csrf_token', csrfToken(CSRF_SECRET, SEED, 2));
		form.append('add_image', '1');
		form.append('req_file', new Blob([new Uint8Array(content)]), name);
		const request = new Request('http://x/', { method: 'POST', body: form });
		return server.inject({
			method: 'POST',
			url: '/admin_loader.php?plugin=AP_Smilies.php',
			headers: { cookie: cookies(2), 'content-type': request.headers.get('content-type') ?? '' },
			payload: Buffer.from(await request.arrayBuffer()),
		});
	}

	it('type lu dans le contenu, 20 × 20 au plus, nom sûr', async () => {
		const { server, fake } = await start();
		expect((await upload(server, 'grand.png', png(40, 40))).body).toContain('20 × 20 pixels');
		expect((await upload(server, 'faux.png', Buffer.from('<?php'))).body).toContain('n&#39;est pas autorisé');
		expect((await upload(server, '../../evil.png', png(20, 20))).statusCode).toBe(303);
		expect((await upload(server, 'clin d oeil.png', png(20, 20))).statusCode).toBe(400);
		const ok = await upload(server, 'clin.gif', png(16, 16));
		expect(ok.headers.location).toBe('admin_loader.php?plugin=AP_Smilies.php&done=uploaded');
		expect(fake.smileyImageNames).toEqual(['evil.png', 'clin.png']);
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
		expect(page.body).toContain('style="color: #00AA00"');
		expect(page.body).not.toContain('url(x)');
		expect((await send(server, '&action=add', { nom: 'Réglé', color1: '#000000', baltype: '0' })).body).toContain('déjà utilisé');
		expect((await send(server, '&action=add', { nom: 'Urgent', color1: 'rouge' })).body).toContain('n&#39;est pas valide');
		await send(server, '&action=add', { nom: 'Urgent', color1: '#FF0000', baltype: '2', affich: '1' });
		expect(fake.labelRows?.at(-1)).toMatchObject({ id: 9, name: 'Urgent', style: 2, moderatorVisible: true });
		await send(server, '&action=edit&id=1', { nom: 'Autre', color1: '#123456', position: '5', baltype: '1' });
		expect(fake.labelRows?.[0]).toMatchObject({ name: 'Réglé', color: '#123456', position: 5, style: 1, bold: false });
		expect((await get(server, 2, '/admin_loader.php?plugin=AP_Balises.php&action=delete&id=2')).body).toContain('name="delete_comply"');
		await send(server, '&action=delete&id=2', { delete_comply: '1' });
		expect(fake.labelRows?.map((l) => l.id)).toEqual([1, 9]);
	});
});
