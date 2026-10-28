/**
 * Administration des catégories et des forums (admin_categories.php, admin_forums.php) : listes,
 * ajout, positions, modification, permissions par groupe et suppression avec tout leur contenu.
 */

import type { Kysely } from 'kysely';
import type { Db } from '../db/database.ts';
import type { Database } from '../db/schema.ts';
import { GroupId } from '../domain/models.ts';
import type { EffectivePermission, GroupForumPermissionRow } from '../services/forumPermissions.ts';
import { deleteOrphanRedirects, pruneForum } from './pruning.ts';
import { inTransaction } from './transactions.ts';

export interface AdminCategory {
	id: number;
	name: string;
	position: number;
}

export interface AdminForumRow {
	categoryId: number;
	categoryName: string;
	forumId: number;
	forumName: string;
	position: number;
}

export interface AdminForum {
	id: number;
	name: string;
	description: string;
	redirectUrl: string;
	numTopics: number;
	/** 0 : dernier message, 1 : début du sujet, 2 : sujet. */
	sortBy: number;
	categoryId: number;
}

export interface ForumDetails {
	name: string;
	/** null : NULL en base, comme le PHP pour une chaîne vide. */
	description: string | null;
	redirectUrl: string | null;
	sortBy: number;
	categoryId: number;
}

export interface ForumAdminStore {
	listCategories(): Promise<AdminCategory[]>;
	addCategory(name: string): Promise<void>;
	updateCategories(categories: readonly AdminCategory[]): Promise<void>;
	/** Supprime la catégorie, ses forums et tout leur contenu. */
	deleteCategory(id: number): Promise<void>;
	/** Forums groupés par catégorie (catégories sans forum exclues, comme le PHP). */
	listForums(): Promise<AdminForumRow[]>;
	addForum(categoryId: number, name: string): Promise<void>;
	updateForumPositions(positions: readonly { id: number; position: number }[]): Promise<void>;
	findForum(id: number): Promise<AdminForum | null>;
	updateForum(id: number, details: ForumDetails): Promise<void>;
	/** Groupes autres qu'administrateurs, avec leur éventuelle ligne forum_perms pour ce forum. */
	listGroupPermissions(forumId: number): Promise<GroupForumPermissionRow[]>;
	/** null : retour aux réglages du groupe (ligne supprimée). */
	setGroupPermission(forumId: number, groupId: number, permission: EffectivePermission | null): Promise<void>;
	revertPermissions(forumId: number): Promise<void>;
	deleteForum(id: number): Promise<void>;
}

const flag = (value: boolean): number => (value ? 1 : 0);

/** Forum supprimé avec ses sujets, permissions et abonnements (admin_forums.php?del_forum). */
async function deleteForumContent(trx: Kysely<Database>, forumId: number): Promise<void> {
	await pruneForum(trx, forumId, true, null);
	await deleteOrphanRedirects(trx);
	await trx.deleteFrom('forums').where('id', '=', forumId).execute();
	await trx.deleteFrom('forum_perms').where('forum_id', '=', forumId).execute();
	await trx.deleteFrom('forum_subscriptions').where('forum_id', '=', forumId).execute();
}

export class ForumAdminRepository implements ForumAdminStore {
	constructor(private readonly db: Db) {}

	async listCategories(): Promise<AdminCategory[]> {
		const rows = await this.db
			.selectFrom('categories')
			.select(['id', 'cat_name', 'disp_position'])
			.orderBy('disp_position')
			.orderBy('id')
			.execute();
		return rows.map((row) => ({ id: row.id, name: row.cat_name, position: row.disp_position }));
	}

	async addCategory(name: string): Promise<void> {
		await this.db.insertInto('categories').values({ cat_name: name, disp_position: 0 }).execute();
	}

	async updateCategories(categories: readonly AdminCategory[]): Promise<void> {
		await inTransaction(this.db, async (trx) => {
			for (const category of categories)
				await trx
					.updateTable('categories')
					.set({ cat_name: category.name, disp_position: category.position })
					.where('id', '=', category.id)
					.execute();
		});
	}

	async deleteCategory(id: number): Promise<void> {
		await inTransaction(this.db, async (trx) => {
			const forums = await trx.selectFrom('forums').select('id').where('cat_id', '=', id).execute();
			for (const forum of forums) {
				await pruneForum(trx, forum.id, true, null);
				await trx.deleteFrom('forums').where('id', '=', forum.id).execute();
			}
			await deleteOrphanRedirects(trx);
			await trx.deleteFrom('categories').where('id', '=', id).execute();
		});
	}

	async listForums(): Promise<AdminForumRow[]> {
		const rows = await this.db
			.selectFrom('categories as c')
			.innerJoin('forums as f', 'f.cat_id', 'c.id')
			.select(['c.id as cid', 'c.cat_name', 'f.id as fid', 'f.forum_name', 'f.disp_position'])
			.orderBy('c.disp_position')
			.orderBy('c.id')
			.orderBy('f.disp_position')
			.execute();
		return rows.map((row) => ({
			categoryId: row.cid,
			categoryName: row.cat_name,
			forumId: row.fid,
			forumName: row.forum_name,
			position: row.disp_position,
		}));
	}

	async addForum(categoryId: number, name: string): Promise<void> {
		await this.db.insertInto('forums').values({ forum_name: name, cat_id: categoryId }).execute();
	}

	async updateForumPositions(positions: readonly { id: number; position: number }[]): Promise<void> {
		await inTransaction(this.db, async (trx) => {
			for (const { id, position } of positions)
				await trx.updateTable('forums').set({ disp_position: position }).where('id', '=', id).execute();
		});
	}

	async findForum(id: number): Promise<AdminForum | null> {
		const row = await this.db
			.selectFrom('forums')
			.select(['id', 'forum_name', 'forum_desc', 'redirect_url', 'num_topics', 'sort_by', 'cat_id'])
			.where('id', '=', id)
			.executeTakeFirst();
		if (row === undefined) return null;
		return {
			id: row.id,
			name: row.forum_name,
			description: row.forum_desc ?? '',
			redirectUrl: row.redirect_url ?? '',
			numTopics: row.num_topics,
			sortBy: row.sort_by,
			categoryId: row.cat_id,
		};
	}

	async updateForum(id: number, details: ForumDetails): Promise<void> {
		await this.db
			.updateTable('forums')
			.set({
				forum_name: details.name,
				forum_desc: details.description,
				redirect_url: details.redirectUrl,
				sort_by: details.sortBy,
				cat_id: details.categoryId,
			})
			.where('id', '=', id)
			.execute();
	}

	async listGroupPermissions(forumId: number): Promise<GroupForumPermissionRow[]> {
		const rows = await this.db
			.selectFrom('groups as g')
			.leftJoin('forum_perms as fp', (join) => join.onRef('fp.group_id', '=', 'g.g_id').on('fp.forum_id', '=', forumId))
			.select([
				'g.g_id',
				'g.g_title',
				'g.g_read_board',
				'g.g_post_replies',
				'g.g_post_topics',
				'fp.read_forum',
				'fp.post_replies',
				'fp.post_topics',
			])
			.where('g.g_id', '!=', GroupId.Admin)
			.orderBy('g.g_id')
			.execute();
		return rows.map((row) => ({
			groupId: row.g_id,
			title: row.g_title,
			groupReadBoard: row.g_read_board === 1,
			groupPostReplies: row.g_post_replies === 1,
			groupPostTopics: row.g_post_topics === 1,
			forum:
				row.read_forum !== null
					? { readForum: row.read_forum !== 0, postReplies: row.post_replies === 1, postTopics: row.post_topics === 1 }
					: null,
		}));
	}

	async setGroupPermission(forumId: number, groupId: number, permission: EffectivePermission | null): Promise<void> {
		if (permission === null) {
			await this.db.deleteFrom('forum_perms').where('group_id', '=', groupId).where('forum_id', '=', forumId).execute();
			return;
		}
		const values = {
			read_forum: flag(permission.readForum),
			post_replies: flag(permission.postReplies),
			post_topics: flag(permission.postTopics),
		};
		// UPDATE puis INSERT si aucune ligne, comme le PHP (pas de clé unique garantie sur forum_perms).
		await inTransaction(this.db, async (trx) => {
			const existing = await trx
				.selectFrom('forum_perms')
				.select('group_id')
				.where('group_id', '=', groupId)
				.where('forum_id', '=', forumId)
				.executeTakeFirst();
			if (existing !== undefined)
				await trx.updateTable('forum_perms').set(values).where('group_id', '=', groupId).where('forum_id', '=', forumId).execute();
			else
				await trx
					.insertInto('forum_perms')
					.values({ group_id: groupId, forum_id: forumId, ...values })
					.execute();
		});
	}

	async revertPermissions(forumId: number): Promise<void> {
		await this.db.deleteFrom('forum_perms').where('forum_id', '=', forumId).execute();
	}

	async deleteForum(id: number): Promise<void> {
		await inTransaction(this.db, (trx) => deleteForumContent(trx, id));
	}
}
