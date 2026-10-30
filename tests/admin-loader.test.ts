/**
 * Plugins d'administration (admin_loader.php) : droits AP_/AMP_, plugins non portés redirigés vers
 * le PHP, ajout d'utilisateur du plugin « Gestion d'utilisateur ».
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { GroupId } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { boardConfig, type FakeData, fakeDeps, group, guest, sessionCookie, TEST_SUBJECT_TAGS, topic, viewer } from './fixtures.ts';

const SEED = 'graine-de-test';
const CSRF_SECRET = '9'.repeat(64);
const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true }) });
const admin = viewer({ id: 2, username: 'admin', group: group({ id: GroupId.Admin }) });
const cookies = (userId: number): string => `${sessionCookie(userId)}; avrobb_csrf=${CSRF_SECRET}`;
const PLUGIN = '/admin_loader.php?plugin=AP_Private_messaging.php';

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

async function start(): Promise<{ server: FastifyInstance; fake: FakeData }> {
	const fake: FakeData = {
		users: [{ viewer: guest }, { viewer: mod }, { viewer: admin }],
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
describe('admin_loader.php', () => {
	it('droits : AP_ pour les administrateurs ; plugin inconnu refusé', async () => {
		const { server } = await start();
		expect((await get(server, 2, PLUGIN)).statusCode).toBe(200);
		expect((await get(server, 5, PLUGIN)).statusCode).toBe(403);
		expect((await get(server, 2, '/admin_loader.php?plugin=AMP_Gestion_utilisateurs.php')).statusCode).toBe(400);
		expect((await get(server, 2, '/admin_loader.php?plugin=../config.php')).statusCode).toBe(400);
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

	it('les plugins de PV (Sondage, FluxToolBar, Plugile, Uploadile, PunBalise seul…) ne font pas partie d’AvroBB', async () => {
		const { server } = await withConfig({});
		for (const plugin of [
			'AP_Sondage.php',
			'AP_Mod_Installer.php',
			'AP_FluxToolBar.php',
			'AP_Plugile.php',
			'AP_Premium.php',
			'AP_Smilies.php',
			'AP_Uploadile.php',
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
		fake.configValues = new Map([['o_subject_tags', JSON.stringify(TEST_SUBJECT_TAGS)]]);
		fake.topics = [topic({ id: 10, subject: '[MSFS][Résolu] Vol de nuit' })];
		expect((await send(server, '&action=tag_add', { name: 'msfs', group: 'project', color: '#000000' })).body).toContain(
			'porte déjà ce nom',
		);
		await send(server, '&action=tag_add', { name: 'DCS', group: 'project', color: '#FF0000' });
		expect(saved(fake).map((t) => t.name)).toContain('DCS');
		const renamed = await send(server, '&action=tag_edit&tag=MSFS', { name: 'MSFS 2024', group: 'project', color: '#1d4ed8' });
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
