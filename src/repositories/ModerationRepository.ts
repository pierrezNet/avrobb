/**
 * Modération des sujets et messages (moderate.php) : suppression et scission de messages,
 * déplacement, fusion, suppression, fermeture et épinglage de sujets. Chaque action vérifie que les éléments visés appartiennent bien au forum modéré
 * et reproduit les effets de bord du PHP (compteurs, update_forum(), index de recherche,
 * abonnements, liens de redirection), dans une transaction.
 */

import { type Kysely, sql } from 'kysely';
import type { Db } from '../db/database.ts';
import type { Database } from '../db/schema.ts';
import { type ForumTarget, GroupId, type ModeratedTopic } from '../domain/models.ts';
import { updateForum } from './forumCounters.ts';
import { forumReadable } from './forumPermissions.ts';
import { stripSearchIndex } from './searchIndexSql.ts';
import { inTransaction } from './transactions.ts';

export type DeleteTopicsResult = 'deleted' | 'invalid' | 'adminPosts';

export interface ModerationStore {
	/** Sujet du forum, lisible par le groupe, hors liens de déplacement. */
	findTopic(topicId: number, forumId: number, groupId: number): Promise<ModeratedTopic | null>;
	/** Forums où le groupe peut créer des sujets (destinations de déplacement et de scission). */
	listTargetForums(groupId: number): Promise<ForumTarget[]>;
	/** IP enregistrée d'un message (moderate.php?get_host=<id>). */
	findPostIp(postId: number): Promise<string | null>;
	/** Supprime des réponses du sujet (jamais son premier message) ; faux si un message ne convient pas. */
	deletePosts(topic: ModeratedTopic, postIds: readonly number[], allowAdminPosts: boolean): Promise<boolean>;
	/**
	 * Déplace des réponses dans un nouveau sujet d'un forum où le groupe peut écrire ; renvoie son
	 * id, ou null si la demande est invalide.
	 */
	splitPosts(
		topic: ModeratedTopic,
		postIds: readonly number[],
		targetForumId: number,
		subject: string,
		groupId: number,
	): Promise<number | null>;
	/** Déplace des sujets du forum vers un forum où le groupe peut écrire ; faux si la demande est invalide. */
	moveTopics(forumId: number, topicIds: readonly number[], targetForumId: number, withRedirect: boolean, groupId: number): Promise<boolean>;
	/** Fusionne dans le sujet le plus ancien ; renvoie son id, ou null si la demande est invalide. */
	mergeTopics(forumId: number, topicIds: readonly number[], withRedirect: boolean): Promise<number | null>;
	deleteTopics(forumId: number, topicIds: readonly number[], allowAdminPosts: boolean): Promise<DeleteTopicsResult>;
	setClosed(forumId: number, topicIds: readonly number[], closed: boolean): Promise<void>;
	setSticky(forumId: number, topicId: number, sticky: boolean): Promise<boolean>;
}

/** Messages écrits par un administrateur (get_admin_ids()). */
async function hasAdminPosts(trx: Kysely<Database>, column: 'id' | 'topic_id', ids: readonly number[]): Promise<boolean> {
	const row = await trx
		.selectFrom('posts as p')
		.innerJoin('users as u', 'u.id', 'p.poster_id')
		.select('p.id')
		.where(`p.${column}`, 'in', ids)
		.where('u.group_id', '=', GroupId.Admin)
		.limit(1)
		.executeTakeFirst();
	return row !== undefined;
}

/** Dernier message et nombre de réponses d'un sujet, recalculés d'après ses messages. */
async function refreshTopic(trx: Kysely<Database>, topicId: number): Promise<void> {
	const last = await trx
		.selectFrom('posts')
		.select(['id', 'poster', 'posted'])
		.where('topic_id', '=', topicId)
		.orderBy('id', 'desc')
		.limit(1)
		.executeTakeFirst();
	const { count } = await trx
		.selectFrom('posts')
		.select((eb) => eb.fn.count<number>('id').as('count'))
		.where('topic_id', '=', topicId)
		.executeTakeFirstOrThrow();
	if (last === undefined) return;
	await trx
		.updateTable('topics')
		.set({ last_post: last.posted, last_post_id: last.id, last_poster: last.poster, num_replies: Number(count) - 1 })
		.where('id', '=', topicId)
		.execute();
}

export class ModerationRepository implements ModerationStore {
	constructor(private readonly db: Db) {}

	async findTopic(topicId: number, forumId: number, groupId: number): Promise<ModeratedTopic | null> {
		const row = await this.db
			.selectFrom('topics as t')
			.innerJoin('forums as f', 'f.id', 't.forum_id')
			.leftJoin('forum_perms as fp', (join) => join.onRef('fp.forum_id', '=', 'f.id').on('fp.group_id', '=', groupId))
			.select(['t.id', 't.subject', 't.num_replies', 't.first_post_id', 'f.id as forum_id', 'f.forum_name'])
			.where('t.id', '=', topicId)
			.where('f.id', '=', forumId)
			.where('t.moved_to', 'is', null)
			.where(forumReadable)
			.executeTakeFirst();
		return row !== undefined
			? {
					id: row.id,
					subject: row.subject,
					numReplies: row.num_replies,
					firstPostId: row.first_post_id,
					forum: { id: row.forum_id, name: row.forum_name },
				}
			: null;
	}

	async listTargetForums(groupId: number): Promise<ForumTarget[]> {
		const rows = await this.db
			.selectFrom('categories as c')
			.innerJoin('forums as f', 'c.id', 'f.cat_id')
			.leftJoin('forum_perms as fp', (join) => join.onRef('fp.forum_id', '=', 'f.id').on('fp.group_id', '=', groupId))
			.select(['c.id as cid', 'c.cat_name', 'f.id as fid', 'f.forum_name'])
			.where((eb) => eb.or([eb('fp.post_topics', 'is', null), eb('fp.post_topics', '=', 1)]))
			.where('f.redirect_url', 'is', null)
			.orderBy('c.disp_position')
			.orderBy('c.id')
			.orderBy('f.disp_position')
			.execute();
		return rows.map((row) => ({ categoryId: row.cid, categoryName: row.cat_name, forumId: row.fid, forumName: row.forum_name }));
	}

	async findPostIp(postId: number): Promise<string | null> {
		const row = await this.db.selectFrom('posts').select('poster_ip').where('id', '=', postId).executeTakeFirst();
		return row?.poster_ip ?? null;
	}

	/** Les messages sont-ils tous des réponses de ce sujet ? */
	async #areReplies(trx: Kysely<Database>, topic: ModeratedTopic, postIds: readonly number[]): Promise<boolean> {
		if (postIds.length === 0 || postIds.includes(topic.firstPostId)) return false;
		const rows = await trx.selectFrom('posts').select('id').where('id', 'in', postIds).where('topic_id', '=', topic.id).execute();
		return rows.length === postIds.length;
	}

	/** Le forum de destination accepte-t-il de nouveaux sujets pour ce groupe ? */
	async #isTarget(trx: Kysely<Database>, forumId: number, groupId: number): Promise<boolean> {
		const row = await trx
			.selectFrom('forums as f')
			.leftJoin('forum_perms as fp', (join) => join.onRef('fp.forum_id', '=', 'f.id').on('fp.group_id', '=', groupId))
			.select('f.id')
			.where('f.id', '=', forumId)
			.where('f.redirect_url', 'is', null)
			.where((eb) => eb.or([eb('fp.post_topics', 'is', null), eb('fp.post_topics', '=', 1)]))
			.executeTakeFirst();
		return row !== undefined;
	}

	deletePosts(topic: ModeratedTopic, postIds: readonly number[], allowAdminPosts: boolean): Promise<boolean> {
		return inTransaction(this.db, async (trx) => {
			if (!(await this.#areReplies(trx, topic, postIds))) return false;
			if (!allowAdminPosts && (await hasAdminPosts(trx, 'id', postIds))) return false;
			await trx.deleteFrom('posts').where('id', 'in', postIds).execute();
			await stripSearchIndex(trx, postIds);
			await refreshTopic(trx, topic.id);
			await updateForum(trx, topic.forum.id);
			return true;
		});
	}

	splitPosts(
		topic: ModeratedTopic,
		postIds: readonly number[],
		targetForumId: number,
		subject: string,
		groupId: number,
	): Promise<number | null> {
		return inTransaction(this.db, async (trx) => {
			if (!(await this.#areReplies(trx, topic, postIds))) return null;
			if (!(await this.#isTarget(trx, targetForumId, groupId))) return null;

			const first = await trx
				.selectFrom('posts')
				.select(['id', 'poster', 'posted'])
				.where('id', 'in', postIds)
				.orderBy('id')
				.limit(1)
				.executeTakeFirstOrThrow();
			const created = await trx
				.insertInto('topics')
				.values({
					poster: first.poster,
					subject,
					posted: first.posted,
					first_post_id: first.id,
					last_post: first.posted,
					last_post_id: first.id,
					last_poster: first.poster,
					sticky: 0,
					forum_id: targetForumId,
				})
				.executeTakeFirstOrThrow();
			const newTopicId = Number(created.insertId);

			await trx.updateTable('posts').set({ topic_id: newTopicId }).where('id', 'in', postIds).execute();
			// Les abonnés au sujet d'origine suivent aussi le nouveau.
			await sql`INSERT INTO ${sql.table('topic_subscriptions')} (user_id, topic_id) SELECT user_id, ${newTopicId} FROM ${sql.table('topic_subscriptions')} WHERE topic_id = ${topic.id}`.execute(
				trx,
			);
			await refreshTopic(trx, topic.id);
			await refreshTopic(trx, newTopicId);
			await updateForum(trx, topic.forum.id);
			if (targetForumId !== topic.forum.id) await updateForum(trx, targetForumId);
			return newTopicId;
		});
	}

	moveTopics(
		forumId: number,
		topicIds: readonly number[],
		targetForumId: number,
		withRedirect: boolean,
		groupId: number,
	): Promise<boolean> {
		return inTransaction(this.db, async (trx) => {
			if (topicIds.length === 0 || targetForumId === forumId) return false;
			const found = await trx.selectFrom('topics').select('id').where('id', 'in', topicIds).where('forum_id', '=', forumId).execute();
			if (found.length !== topicIds.length) return false;
			if (!(await this.#isTarget(trx, targetForumId, groupId))) return false;

			// Liens de redirection devenus inutiles : le sujet revient là d'où il avait été déplacé.
			await trx.deleteFrom('topics').where('forum_id', '=', targetForumId).where('moved_to', 'in', topicIds).execute();
			await trx.updateTable('topics').set({ forum_id: targetForumId }).where('id', 'in', topicIds).execute();

			if (withRedirect) {
				const moved = await trx
					.selectFrom('topics')
					.select(['id', 'poster', 'subject', 'posted', 'last_post'])
					.where('id', 'in', topicIds)
					.execute();
				for (const topic of moved)
					await trx
						.insertInto('topics')
						.values({
							poster: topic.poster,
							subject: topic.subject,
							posted: topic.posted,
							last_post: topic.last_post,
							moved_to: topic.id,
							sticky: 0,
							forum_id: forumId,
						})
						.execute();
			}
			await updateForum(trx, forumId);
			await updateForum(trx, targetForumId);
			return true;
		});
	}

	mergeTopics(forumId: number, topicIds: readonly number[], withRedirect: boolean): Promise<number | null> {
		return inTransaction(this.db, async (trx) => {
			if (topicIds.length < 2) return null;
			const found = await trx
				.selectFrom('topics')
				.select('id')
				.where('id', 'in', topicIds)
				.where('forum_id', '=', forumId)
				.orderBy('id')
				.execute();
			if (found.length !== topicIds.length) return null;
			const target = found[0]?.id ?? 0;
			const others = topicIds.filter((id) => id !== target);

			// Les liens de redirection pointent vers le sujet fusionné ; les anciens sujets en deviennent un si demandé.
			await trx.updateTable('topics').set({ moved_to: target }).where('moved_to', 'in', topicIds).execute();
			if (withRedirect) await trx.updateTable('topics').set({ moved_to: target }).where('id', 'in', others).execute();

			await trx.updateTable('posts').set({ topic_id: target }).where('topic_id', 'in', topicIds).execute();

			const subscribers = await trx
				.selectFrom('topic_subscriptions')
				.select('user_id')
				.distinct()
				.where('topic_id', 'in', topicIds)
				.execute();
			await trx.deleteFrom('topic_subscriptions').where('topic_id', 'in', topicIds).execute();
			if (subscribers.length > 0)
				await trx
					.insertInto('topic_subscriptions')
					.values(subscribers.map((row) => ({ user_id: row.user_id, topic_id: target })))
					.execute();

			if (!withRedirect) await trx.deleteFrom('topics').where('id', 'in', others).execute();
			await refreshTopic(trx, target);
			await updateForum(trx, forumId);
			return target;
		});
	}

	deleteTopics(forumId: number, topicIds: readonly number[], allowAdminPosts: boolean): Promise<DeleteTopicsResult> {
		return inTransaction(this.db, async (trx) => {
			if (topicIds.length === 0) return 'invalid';
			const found = await trx.selectFrom('topics').select('id').where('id', 'in', topicIds).where('forum_id', '=', forumId).execute();
			if (found.length !== topicIds.length) return 'invalid';
			if (!allowAdminPosts && (await hasAdminPosts(trx, 'topic_id', topicIds))) return 'adminPosts';

			await trx
				.deleteFrom('topics')
				.where((eb) => eb.or([eb('id', 'in', topicIds), eb('moved_to', 'in', topicIds)]))
				.execute();
			await trx.deleteFrom('topic_subscriptions').where('topic_id', 'in', topicIds).execute();
			const posts = await trx.selectFrom('posts').select('id').where('topic_id', 'in', topicIds).execute();
			if (posts.length > 0) {
				await stripSearchIndex(
					trx,
					posts.map((post) => post.id),
				);
				await trx.deleteFrom('posts').where('topic_id', 'in', topicIds).execute();
			}
			await updateForum(trx, forumId);
			return 'deleted';
		});
	}

	async setClosed(forumId: number, topicIds: readonly number[], closed: boolean): Promise<void> {
		if (topicIds.length === 0) return;
		await this.db
			.updateTable('topics')
			.set({ closed: closed ? 1 : 0 })
			.where('id', 'in', topicIds)
			.where('forum_id', '=', forumId)
			.execute();
	}

	async setSticky(forumId: number, topicId: number, sticky: boolean): Promise<boolean> {
		const result = await this.db
			.updateTable('topics')
			.set({ sticky: sticky ? 1 : 0 })
			.where('id', '=', topicId)
			.where('forum_id', '=', forumId)
			.executeTakeFirst();
		return Number(result.numUpdatedRows) > 0 || (await this.#topicInForum(topicId, forumId));
	}

	async #topicInForum(topicId: number, forumId: number): Promise<boolean> {
		const row = await this.db
			.selectFrom('topics')
			.select('id')
			.where('id', '=', topicId)
			.where('forum_id', '=', forumId)
			.executeTakeFirst();
		return row !== undefined;
	}
}
