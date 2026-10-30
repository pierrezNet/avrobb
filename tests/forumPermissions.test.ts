/**
 * Permissions d'un groupe dans un forum et lecture des formulaires d'admin_categories.php et
 * d'admin_forums.php (services/forumPermissions.ts, services/forumAdminForms.ts).
 */

import { describe, expect, it } from 'vitest';
import { readCategoryUpdates, readForumDetails, readForumPositions, readGroupPermission } from '../src/services/forumAdminForms.ts';
import { differsFromGroup, effectivePermission, type GroupForumPermissionRow, permissionChange } from '../src/services/forumPermissions.ts';

const members: GroupForumPermissionRow = {
	groupId: 4,
	title: 'Membres',
	groupReadBoard: true,
	groupPostReplies: true,
	groupPostTopics: true,
	forum: null,
};
const all = { readForum: true, postReplies: true, postTopics: true };

describe('permissions de groupe', () => {
	it('valeurs affichées : la ligne forum_perms, sinon les réglages du groupe', () => {
		expect(effectivePermission(members)).toEqual(all);
		const custom = { ...members, forum: { readForum: true, postReplies: false, postTopics: true } };
		expect(effectivePermission(custom)).toEqual({ readForum: true, postReplies: false, postTopics: true });
		expect(differsFromGroup(custom)).toEqual({ readForum: false, postReplies: true, postTopics: false });
	});

	it('enregistrement : inchangé, retour aux réglages du groupe ou ligne propre au forum', () => {
		expect(permissionChange(members, all, all)).toEqual({ kind: 'unchanged' });
		const noTopics = { ...all, postTopics: false };
		expect(permissionChange(members, all, noTopics)).toEqual({ kind: 'set', permission: noTopics });
		expect(permissionChange(members, noTopics, all)).toEqual({ kind: 'default' });
	});

	it('la lecture ne change pas pour un groupe qui ne peut pas lire le forum', () => {
		const guests = { ...members, groupReadBoard: false };
		expect(permissionChange(guests, all, { ...all, readForum: false })).toEqual({ kind: 'unchanged' });
	});
});

describe('formulaires', () => {
	it('catégories : nom obligatoire, position entière', () => {
		expect(readCategoryUpdates({ 'cat[3][name]': ' Simus ', 'cat[3][order]': '2' })).toEqual({
			kind: 'ok',
			categories: [{ id: 3, name: 'Simus', position: 2 }],
		});
		expect(readCategoryUpdates({ 'cat[3][name]': '', 'cat[3][order]': '2' })).toEqual({ kind: 'error', error: 'missingName' });
		expect(readCategoryUpdates({ 'cat[3][name]': 'A', 'cat[3][order]': '-1' })).toEqual({ kind: 'error', error: 'notInteger' });
		expect(readCategoryUpdates({})).toEqual({ kind: 'badRequest' });
	});

	it('positions des forums', () => {
		expect(readForumPositions({ 'position[1]': '4', 'position[2]': ' 0 ', 'position[x]': '1' })).toEqual([
			{ id: 1, position: 4 },
			{ id: 2, position: 0 },
		]);
		expect(readForumPositions({ 'position[1]': '1.5' })).toBeNull();
	});

	it('détails du forum', () => {
		expect(readForumDetails({ forum_name: 'Hangar', forum_desc: 'a\r\nb', cat_id: '2', sort_by: '1', redirect_url: '' })).toEqual({
			kind: 'ok',
			name: 'Hangar',
			description: 'a\nb',
			redirectUrl: null,
			siteUrl: null,
			repoUrl: null,
			sortBy: 1,
			categoryId: 2,
		});
		expect(readForumDetails({ forum_name: ' ', cat_id: '2', sort_by: '0' })).toEqual({ kind: 'missingName' });
		expect(readForumDetails({ forum_name: 'A', cat_id: '0', sort_by: '0' })).toEqual({ kind: 'badRequest' });
	});

	it('liens du projet : http(s) seulement, « www. » complété', () => {
		const details = (site_url: string, repo_url = '') =>
			readForumDetails({ forum_name: 'A', cat_id: '1', sort_by: '0', site_url, repo_url });
		expect(details(' https://avrobb.example/ ', 'www.github.com/epierrez/avrobb')).toMatchObject({
			kind: 'ok',
			siteUrl: 'https://avrobb.example/',
			repoUrl: 'https://www.github.com/epierrez/avrobb',
		});
		expect(details('javascript:alert(1)')).toEqual({ kind: 'badLink' });
		expect(details('ftp://example.test/')).toEqual({ kind: 'badLink' });
		expect(details('pas une adresse')).toEqual({ kind: 'badLink' });
		expect(details(`https://example.test/${'a'.repeat(260)}`)).toEqual({ kind: 'badLink' });
	});

	it('permissions envoyées pour un groupe', () => {
		expect(
			readGroupPermission({ 'read_forum_old[4]': '1', 'post_replies_old[4]': '1', 'post_topics_old[4]': '0', 'read_forum_new[4]': '1' }, 4),
		).toEqual({
			old: { readForum: true, postReplies: true, postTopics: false },
			sent: { readForum: true, postReplies: false, postTopics: false },
		});
		expect(readGroupPermission({}, 4)).toBeNull();
	});
});
