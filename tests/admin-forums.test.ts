/**
 * Catégories (admin_categories.php) et forums (admin_forums.php) de bout en bout avec les doublures.
 */

import { describe, expect, it } from 'vitest';
import { buildApp, type ForumApp } from '../src/app.ts';
import { GroupId } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { type FakeData, fakeDeps, group, guest, sessionCookie, viewer } from './fixtures.ts';
import { inject } from './inject.ts';

const SEED = 'graine-de-test';
const CSRF_SECRET = '9'.repeat(64);
const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true }) });
const admin = viewer({ id: 2, username: 'admin', group: group({ id: GroupId.Admin }) });
const cookies = (userId: number): string => `${sessionCookie(userId)}; avrobb_csrf=${CSRF_SECRET}`;

let app: ForumApp | undefined;

async function start(): Promise<{ server: ForumApp; fake: FakeData }> {
	const fake: FakeData = {
		users: [{ viewer: guest }, { viewer: mod }, { viewer: admin }],
		topics: [],
		posts: new Map(),
		forumAdmin: {
			categories: [
				{ id: 1, name: 'Simulateurs', position: 1 },
				{ id: 2, name: 'Ateliers', position: 2 },
			],
			forums: [
				{ id: 7, name: 'Technique', description: '', redirectUrl: '', siteUrl: '', repoUrl: '', numTopics: 3, sortBy: 0, categoryId: 1 },
				{ id: 8, name: 'Vide', description: '', redirectUrl: '', siteUrl: '', repoUrl: '', numTopics: 0, sortBy: 0, categoryId: 2 },
			],
			permissions: [
				{ groupId: 3, title: 'Invités', groupReadBoard: true, groupPostReplies: false, groupPostTopics: false, forum: null },
				{
					groupId: 4,
					title: 'Membres',
					groupReadBoard: true,
					groupPostReplies: true,
					groupPostTopics: true,
					forum: { readForum: true, postReplies: true, postTopics: false },
				},
			],
		},
	};
	app = await buildApp(fakeDeps(fake));
	return { server: app, fake };
}

const get = (server: ForumApp, userId: number, url: string) => inject(server, { url, headers: { cookie: cookies(userId) } });

function post(server: ForumApp, userId: number, url: string, fields: Record<string, string>) {
	const body = new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, userId), ...fields });
	return inject(server, {
		method: 'POST',
		url,
		headers: { cookie: cookies(userId), 'content-type': 'application/x-www-form-urlencoded' },
		payload: body.toString(),
	});
}

describe('admin_categories.php', () => {
	it('réservé aux administrateurs, liste et ajout', async () => {
		const { server, fake } = await start();
		expect((await get(server, 5, '/admin_categories.php')).statusCode).toBe(403);
		const page = await get(server, 2, '/admin_categories.php');
		expect(page.body).toContain('name="cat[2][name]" value="Ateliers"');
		expect((await post(server, 2, '/admin_categories.php', { add_cat: '1', new_cat_name: ' ' })).statusCode).toBe(400);
		const added = await post(server, 2, '/admin_categories.php', { add_cat: '1', new_cat_name: 'Hangar' });
		expect(added.headers.location).toBe('/admin_categories.php?done=added');
		expect(fake.forumAdminLog).toEqual(['addCategory Hangar']);
	});

	it('suppression après confirmation, mise à jour des noms et positions', async () => {
		const { server, fake } = await start();
		const confirm = await post(server, 2, '/admin_categories.php', { del_cat: '1', cat_to_delete: '2' });
		expect(confirm.body).toContain('name="del_cat_comply"');
		expect(confirm.body).toContain('Ateliers');
		await post(server, 2, '/admin_categories.php', { del_cat_comply: '1', cat_to_delete: '2' });
		const bad = await post(server, 2, '/admin_categories.php', { update: '1', 'cat[1][name]': 'Simus', 'cat[1][order]': 'x' });
		expect(bad.body).toContain('nombre entier positif');
		await post(server, 2, '/admin_categories.php', { update: '1', 'cat[1][name]': 'Simus', 'cat[1][order]': '3' });
		expect(fake.forumAdminLog).toEqual(['deleteCategory 2', 'updateCategories 1:Simus:3']);
	});
});

describe('admin_forums.php', () => {
	it('liste par catégorie, ajout et positions', async () => {
		const { server, fake } = await start();
		const page = await get(server, 2, '/admin_forums.php');
		expect(page.body).toContain('Catégorie : Simulateurs');
		expect(page.body).toContain('name="position[7]"');
		await post(server, 2, '/admin_forums.php', { add_forum: '1', add_to_cat: '2' });
		await post(server, 2, '/admin_forums.php', { update_positions: '1', 'position[7]': '2', 'position[8]': '1' });
		expect((await post(server, 2, '/admin_forums.php', { add_forum: '1', add_to_cat: '9' })).statusCode).toBe(400);
		expect(fake.forumAdminLog).toEqual(['addForum 2 Nouveau forum', 'positions 7:2,8:1']);
	});

	it('suppression : confirmation en GET, effet en POST seulement', async () => {
		const { server, fake } = await start();
		const confirm = await get(server, 2, '/admin_forums.php?del_forum=7');
		expect(confirm.body).toContain('action="/admin_forums.php?del_forum=7"');
		expect(fake.forumAdminLog).toBeUndefined();
		const done = await post(server, 2, '/admin_forums.php?del_forum=7', { del_forum_comply: '1' });
		expect(done.headers.location).toBe('/admin_forums.php?done=deleted');
		expect(fake.forumAdminLog).toEqual(['deleteForum 7']);
	});

	it('traduction anglaise du nom et de la description : saisie, puis retour à l’automatique', async () => {
		const { server, fake } = await start();
		const fields = { save: '1', forum_name: 'Le bar', forum_desc: 'On discute', site_url: '', repo_url: '', cat_id: '1', sort_by: '0' };
		await post(server, 2, '/admin_forums.php?edit_forum=7', { ...fields, forum_name_en: 'The bar', forum_desc_en: 'Chat here' });
		expect(fake.manualTranslations).toEqual(
			new Map([
				['forum_name:7:en', 'The bar'],
				['forum_desc:7:en', 'Chat here'],
			]),
		);
		const page = await get(server, 2, '/admin_forums.php?edit_forum=7');
		expect(page.body).toContain('name="forum_name_en" value="The bar"');
		expect(page.body).toContain('>Chat here</textarea>');
		// Champs vidés : la traduction automatique reprend.
		await post(server, 2, '/admin_forums.php?edit_forum=7', { ...fields, forum_name_en: '', forum_desc_en: '' });
		expect(fake.manualTranslations).toEqual(new Map());
	});

	it('modification : détails et permissions des groupes', async () => {
		const { server, fake } = await start();
		const page = await get(server, 2, '/admin_forums.php?edit_forum=7');
		expect(page.body).toContain('name="post_topics_old[4]" value="0"');
		expect(page.body).toContain('(modifié)');
		expect(page.body).not.toContain('name="redirect_url"');
		const res = await post(server, 2, '/admin_forums.php?edit_forum=7', {
			save: '1',
			forum_name: 'Technique',
			forum_desc: '',
			site_url: 'https://avrobb.example/',
			repo_url: '',
			cat_id: '1',
			sort_by: '2',
			'read_forum_old[3]': '1',
			'post_replies_old[3]': '0',
			'post_topics_old[3]': '0',
			'read_forum_new[3]': '1',
			'post_replies_new[3]': '1',
			'read_forum_old[4]': '1',
			'post_replies_old[4]': '1',
			'post_topics_old[4]': '0',
			'read_forum_new[4]': '1',
			'post_replies_new[4]': '1',
			'post_topics_new[4]': '1',
		});
		expect(res.headers.location).toBe('/admin_forums.php?done=saved');
		expect(fake.forumAdminLog).toEqual([
			'updateForum 7 {"name":"Technique","description":null,"redirectUrl":null,"siteUrl":"https://avrobb.example/","repoUrl":null,"sortBy":2,"categoryId":1}',
			'perm 7 3 {"readForum":true,"postReplies":true,"postTopics":false}',
			'perm 7 4 null',
		]);
		const badLink = await post(server, 2, '/admin_forums.php?edit_forum=7', {
			save: '1',
			forum_name: 'Technique',
			site_url: 'javascript:alert(1)',
			cat_id: '1',
			sort_by: '2',
		});
		expect(badLink.statusCode).toBe(400);
		expect(badLink.body).toContain('Les liens du projet doivent être des adresses web complètes');
		expect(fake.forumAdminLog).toHaveLength(3);
		const reverted = await post(server, 2, '/admin_forums.php?edit_forum=7', { revert_perms: '1' });
		expect(reverted.headers.location).toBe('/admin_forums.php?edit_forum=7&done=reverted');
	});
});
