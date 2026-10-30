/**
 * Administration des catégories et des forums (admin_categories.php, admin_forums.php) : listes,
 * ajout, positions, modification, permissions par groupe et suppression avec tout leur contenu.
 */

import type { Compilable, Db } from '../db/database.ts';
import { GroupId } from '../domain/models.ts';
import type { EffectivePermission, GroupForumPermissionRow } from '../services/forumPermissions.ts';
import { orphanRedirectsDelete, pruneForumsWrites } from './pruning.ts';

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
	/** Liens du projet (chaîne vide : pas de lien). */
	siteUrl: string;
	repoUrl: string;
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
	siteUrl: string | null;
	repoUrl: string | null;
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
async function deleteForumWrites(db: Db, forumId: number): Promise<Compilable[]> {
	return [
		...(await pruneForumsWrites(db, [forumId])),
		orphanRedirectsDelete(db),
		db.deleteFrom('forums').where('id', '=', forumId),
		db.deleteFrom('forum_perms').where('forum_id', '=', forumId),
		db.deleteFrom('forum_subscriptions').where('forum_id', '=', forumId),
	];
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
		await this.db.batch(
			categories.map((category) =>
				this.db.updateTable('categories').set({ cat_name: category.name, disp_position: category.position }).where('id', '=', category.id),
			),
		);
	}

	async deleteCategory(id: number): Promise<void> {
		const forumIds = (await this.db.selectFrom('forums').select('id').where('cat_id', '=', id).execute()).map((row) => row.id);
		await this.db.batch([
			...(await pruneForumsWrites(this.db, forumIds)),
			...(forumIds.length > 0 ? [this.db.deleteFrom('forums').where('id', 'in', forumIds)] : []),
			orphanRedirectsDelete(this.db),
			this.db.deleteFrom('categories').where('id', '=', id),
		]);
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
		await this.db.batch(
			positions.map(({ id, position }) => this.db.updateTable('forums').set({ disp_position: position }).where('id', '=', id)),
		);
	}

	async findForum(id: number): Promise<AdminForum | null> {
		const row = await this.db
			.selectFrom('forums')
			.select(['id', 'forum_name', 'forum_desc', 'redirect_url', 'site_url', 'repo_url', 'num_topics', 'sort_by', 'cat_id'])
			.where('id', '=', id)
			.executeTakeFirst();
		if (row === undefined) return null;
		return {
			id: row.id,
			name: row.forum_name,
			description: row.forum_desc ?? '',
			redirectUrl: row.redirect_url ?? '',
			siteUrl: row.site_url ?? '',
			repoUrl: row.repo_url ?? '',
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
				site_url: details.siteUrl,
				repo_url: details.repoUrl,
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
		// Clé primaire (group_id, forum_id) : insertion, ou mise à jour si la ligne existe déjà.
		await this.db
			.insertInto('forum_perms')
			.values({ group_id: groupId, forum_id: forumId, ...values })
			.onConflict((conflict) => conflict.columns(['group_id', 'forum_id']).doUpdateSet(values))
			.execute();
	}

	async revertPermissions(forumId: number): Promise<void> {
		await this.db.deleteFrom('forum_perms').where('forum_id', '=', forumId).execute();
	}

	async deleteForum(id: number): Promise<void> {
		await this.db.batch(await deleteForumWrites(this.db, id));
	}
}
