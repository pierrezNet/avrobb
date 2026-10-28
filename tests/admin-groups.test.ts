/**
 * Groupes d'utilisateurs (admin_groups.php) : règles du formulaire (services/adminGroups.ts) et pages
 * de bout en bout avec les doublures.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { GroupId } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { type AdminGroup, type GroupColumn, readGroupForm, visibleGroupColumns } from '../src/services/adminGroups.ts';
import { buildLegacyCookie } from '../src/services/legacySession.ts';
import { type FakeData, fakeDeps, group, guest, NOW, viewer } from './fixtures.ts';

const SEED = 'graine-de-test';
const CSRF_SECRET = '9'.repeat(64);
const admin = viewer({ id: 2, username: 'admin', group: group({ id: GroupId.Admin }) });
const cookies = `punbb_cookie=${buildLegacyCookie(2, 'h2', NOW + 3600, SEED)}; punbb_cookie_csrf=${CSRF_SECRET}`;

const zero = (): Record<GroupColumn, number> =>
	Object.fromEntries(
		visibleGroupColumns(GroupId.Member, false)
			.concat(['g_moderator'])
			.map((column) => [column, 0]),
	) as Record<GroupColumn, number>;
const adminGroup = (id: number, title: string, overrides: Partial<Record<GroupColumn, number>> = {}): AdminGroup => ({
	id,
	title,
	userTitle: '',
	values: { ...zero(), g_read_board: 1, ...overrides },
});

describe('règles du formulaire', () => {
	it('champs selon le groupe', () => {
		expect(visibleGroupColumns(GroupId.Admin, false)).toEqual([]);
		expect(visibleGroupColumns(GroupId.Guest, false)).not.toContain('g_edit_posts');
		expect(visibleGroupColumns(GroupId.Guest, false)).not.toContain('g_promote_next_group');
		expect(visibleGroupColumns(GroupId.Member, true)).not.toContain('g_moderator');
		expect(visibleGroupColumns(5, false)).toContain('g_mod_ban_users');
	});

	it('valeurs par défaut quand un champ manque, droits de modération liés au statut de modérateur', () => {
		const form: Record<string, string> = { req_title: ' Pilotes ', mod_ban_users: '1', post_flood: '-4', promote_next_group: '1' };
		const settings = readGroupForm((name) => form[name], 5, [1, 2, 3, 4, 5]);
		expect(settings?.title).toBe('Pilotes');
		expect(settings?.values).toMatchObject({
			g_mod_ban_users: 0,
			g_read_board: 1,
			g_edit_posts: 0,
			g_post_flood: 0,
			g_promote_next_group: 0,
		});
		// Administrateurs : permissions toujours accordées.
		expect(readGroupForm((name) => ({ req_title: 'Admins' })[name], GroupId.Admin, [1])?.values).toMatchObject({
			g_edit_posts: 1,
			g_send_email: 1,
			g_view_users: 1,
		});
		expect(readGroupForm(() => undefined, 5, [])).toBeNull();
	});
});

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

async function start(): Promise<{ server: FastifyInstance; fake: FakeData }> {
	const fake: FakeData = {
		users: [
			{ viewer: guest, passwordHash: '' },
			{ viewer: admin, passwordHash: 'h2' },
		],
		topics: [],
		posts: new Map(),
		adminGroups: [
			adminGroup(1, 'Administrateurs'),
			adminGroup(2, 'Modérateurs', { g_moderator: 1 }),
			adminGroup(3, 'Invités'),
			adminGroup(4, 'Membres'),
			adminGroup(5, 'Pilotes'),
		],
		groupMembers: new Map([[5, 3]]),
	};
	app = await buildApp(fakeDeps(fake));
	return { server: app, fake };
}

const get = (server: FastifyInstance, url: string) => server.inject({ url, headers: { cookie: cookies } });
function post(server: FastifyInstance, url: string, fields: Record<string, string>) {
	return server.inject({
		method: 'POST',
		url,
		headers: { cookie: cookies, 'content-type': 'application/x-www-form-urlencoded' },
		payload: new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, 2), ...fields }).toString(),
	});
}

describe('admin_groups.php', () => {
	it('liste : groupes prédéfinis non supprimables, groupe par défaut sans modérateurs', async () => {
		const { server } = await start();
		const page = await get(server, '/admin_groups.php');
		expect(page.body).toContain('href="admin_groups.php?del_group=5"');
		expect(page.body).not.toContain('del_group=4');
		const defaults = /name="default_group"[\s\S]*?<\/select>/.exec(page.body)?.[0] ?? '';
		expect(defaults).toContain('<option value="5">Pilotes</option>');
		expect(defaults).not.toContain('value="2"');
	});

	it('ajout en deux étapes, titre unique', async () => {
		const { server, fake } = await start();
		const form = await post(server, '/admin_groups.php', { add_group: '1', base_group: '4' });
		expect(form.body).toContain('name="base_group" value="4"');
		expect(form.body).toContain('name="mod_ban_users"');
		const taken = await post(server, '/admin_groups.php', { add_edit_group: '1', mode: 'add', base_group: '4', req_title: 'Pilotes' });
		expect(taken.statusCode).toBe(400);
		const done = await post(server, '/admin_groups.php', { add_edit_group: '1', mode: 'add', base_group: '4', req_title: 'Instructeurs' });
		expect(done.headers.location).toBe('admin_groups.php?done=added');
		expect(fake.groupAdminLog).toEqual(['add Instructeurs from 4']);
	});

	it('modification du groupe des administrateurs : titres seulement', async () => {
		const { server } = await start();
		const page = await get(server, '/admin_groups.php?edit_group=1');
		expect(page.body).toContain('name="req_title" value="Administrateurs"');
		expect(page.body).not.toContain('name="read_board"');
	});

	it('suppression : déplacement des membres, groupe par défaut protégé', async () => {
		const { server, fake } = await start();
		const step = await get(server, '/admin_groups.php?del_group=5');
		expect(step.body).toContain('name="move_to_group"');
		expect(fake.groupAdminLog).toBeUndefined();
		await post(server, '/admin_groups.php?del_group=5', { del_group: '1', move_to_group: '4', group_to_delete: '5' });
		expect(fake.groupAdminLog).toEqual(['delete 5 -> 4']);
		expect((await get(server, '/admin_groups.php?del_group=4')).statusCode).toBe(400);
	});

	it('groupe par défaut', async () => {
		const { server, fake } = await start();
		expect((await post(server, '/admin_groups.php', { set_default_group: '1', default_group: '2' })).statusCode).toBe(400);
		await post(server, '/admin_groups.php', { set_default_group: '1', default_group: '5' });
		expect(fake.configUpdates).toEqual([new Map([['o_default_user_group', '5']])]);
	});
});
