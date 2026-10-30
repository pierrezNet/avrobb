/**
 * Modération des sujets et messages (moderate.php) : suppression et scission de messages,
 * déplacement, fusion, suppression, fermeture et épinglage de sujets. Chaque action vérifie que les éléments visés appartiennent bien au forum modéré
 * et reproduit les effets de bord du PHP (compteurs, update_forum(), index de recherche,
 * abonnements, liens de redirection), dans une transaction.
 */

import { type Db, lastRow } from '../db/database.ts';
import { type ForumTarget, GroupId, type ModeratedTopic } from '../domain/models.ts';
import { updateForumWrite } from './forumCounters.ts';
import { forumReadable } from './forumPermissions.ts';
import { recountTopicWrite } from './PostEditRepository.ts';
import { LAST_TOPIC_ID, stripSearchIndexWrites } from './searchIndexSql.ts';

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
async function hasAdminPosts(trx: Db, column: 'id' | 'topic_id', ids: readonly number[]): Promise<boolean> {
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
	async #areReplies(trx: Db, topic: ModeratedTopic, postIds: readonly number[]): Promise<boolean> {
		if (postIds.length === 0 || postIds.includes(topic.firstPostId)) return false;
		const rows = await trx.selectFrom('posts').select('id').where('id', 'in', postIds).where('topic_id', '=', topic.id).execute();
		return rows.length === postIds.length;
	}

	/** Le forum de destination accepte-t-il de nouveaux sujets pour ce groupe ? */
	async #isTarget(trx: Db, forumId: number, groupId: number): Promise<boolean> {
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

	async deletePosts(topic: ModeratedTopic, postIds: readonly number[], allowAdminPosts: boolean): Promise<boolean> {
		if (!(await this.#areReplies(this.db, topic, postIds))) return false;
		if (!allowAdminPosts && (await hasAdminPosts(this.db, 'id', postIds))) return false;
		await this.db.batch([
			this.db.deleteFrom('posts').where('id', 'in', postIds),
			...(await stripSearchIndexWrites(this.db, postIds)),
			recountTopicWrite(this.db, topic.id),
			updateForumWrite(this.db, topic.forum.id),
		]);
		return true;
	}

	/** Scission : nouveau sujet (LAST_TOPIC_ID) créé avec ses messages et ses abonnés dans un seul lot. */
	async splitPosts(
		topic: ModeratedTopic,
		postIds: readonly number[],
		targetForumId: number,
		subject: string,
		groupId: number,
	): Promise<number | null> {
		if (!(await this.#areReplies(this.db, topic, postIds))) return null;
		if (!(await this.#isTarget(this.db, targetForumId, groupId))) return null;

		const first = await this.db
			.selectFrom('posts')
			.select(['id', 'poster', 'posted'])
			.where('id', 'in', postIds)
			.orderBy('id')
			.limit(1)
			.executeTakeFirstOrThrow();
		const results = await this.db.batch([
			this.db.insertInto('topics').values({
				poster: first.poster,
				subject,
				posted: first.posted,
				first_post_id: first.id,
				last_post: first.posted,
				last_post_id: first.id,
				last_poster: first.poster,
				sticky: 0,
				forum_id: targetForumId,
			}),
			this.db.updateTable('posts').set({ topic_id: LAST_TOPIC_ID }).where('id', 'in', postIds),
			// Les abonnés au sujet d'origine suivent aussi le nouveau.
			this.db
				.insertInto('topic_subscriptions')
				.columns(['user_id', 'topic_id'])
				.expression((eb) =>
					eb
						.selectFrom('topic_subscriptions')
						.select(['user_id', LAST_TOPIC_ID.as('topic_id')])
						.where('topic_id', '=', topic.id),
				),
			recountTopicWrite(this.db, topic.id),
			recountTopicWrite(this.db, LAST_TOPIC_ID),
			updateForumWrite(this.db, topic.forum.id),
			...(targetForumId !== topic.forum.id ? [updateForumWrite(this.db, targetForumId)] : []),
			this.db.selectNoFrom(LAST_TOPIC_ID.as('id')),
		]);
		return lastRow<{ id: number }>(results).id;
	}

	async moveTopics(
		forumId: number,
		topicIds: readonly number[],
		targetForumId: number,
		withRedirect: boolean,
		groupId: number,
	): Promise<boolean> {
		if (topicIds.length === 0 || targetForumId === forumId) return false;
		const found = await this.db.selectFrom('topics').select('id').where('id', 'in', topicIds).where('forum_id', '=', forumId).execute();
		if (found.length !== topicIds.length) return false;
		if (!(await this.#isTarget(this.db, targetForumId, groupId))) return false;

		await this.db.batch([
			// Liens de redirection devenus inutiles : le sujet revient là d'où il avait été déplacé.
			this.db.deleteFrom('topics').where('forum_id', '=', targetForumId).where('moved_to', 'in', topicIds),
			this.db.updateTable('topics').set({ forum_id: targetForumId }).where('id', 'in', topicIds),
			...(withRedirect
				? [
						this.db
							.insertInto('topics')
							.columns(['poster', 'subject', 'posted', 'last_post', 'moved_to', 'sticky', 'forum_id'])
							.expression((eb) =>
								eb
									.selectFrom('topics')
									.select(['poster', 'subject', 'posted', 'last_post', 'id', eb.val(0).as('sticky'), eb.val(forumId).as('forum_id')])
									.where('id', 'in', topicIds),
							),
					]
				: []),
			updateForumWrite(this.db, forumId),
			updateForumWrite(this.db, targetForumId),
		]);
		return true;
	}

	async mergeTopics(forumId: number, topicIds: readonly number[], withRedirect: boolean): Promise<number | null> {
		if (topicIds.length < 2) return null;
		const found = await this.db
			.selectFrom('topics')
			.select('id')
			.where('id', 'in', topicIds)
			.where('forum_id', '=', forumId)
			.orderBy('id')
			.execute();
		if (found.length !== topicIds.length) return null;
		const target = found[0]?.id ?? 0;
		const others = topicIds.filter((id) => id !== target);

		await this.db.batch([
			// Les liens de redirection pointent vers le sujet fusionné ; les anciens sujets en deviennent un si demandé.
			this.db.updateTable('topics').set({ moved_to: target }).where('moved_to', 'in', topicIds),
			...(withRedirect ? [this.db.updateTable('topics').set({ moved_to: target }).where('id', 'in', others)] : []),
			this.db.updateTable('posts').set({ topic_id: target }).where('topic_id', 'in', topicIds),
			// Abonnés des sujets fusionnés reportés sur le sujet gardé, sans doublon.
			this.db
				.insertInto('topic_subscriptions')
				.orIgnore()
				.columns(['user_id', 'topic_id'])
				.expression((eb) =>
					eb
						.selectFrom('topic_subscriptions')
						.select(['user_id', eb.val(target).as('topic_id')])
						.distinct()
						.where('topic_id', 'in', others),
				),
			this.db.deleteFrom('topic_subscriptions').where('topic_id', 'in', others),
			...(withRedirect ? [] : [this.db.deleteFrom('topics').where('id', 'in', others)]),
			recountTopicWrite(this.db, target),
			updateForumWrite(this.db, forumId),
		]);
		return target;
	}

	async deleteTopics(forumId: number, topicIds: readonly number[], allowAdminPosts: boolean): Promise<DeleteTopicsResult> {
		if (topicIds.length === 0) return 'invalid';
		const found = await this.db.selectFrom('topics').select('id').where('id', 'in', topicIds).where('forum_id', '=', forumId).execute();
		if (found.length !== topicIds.length) return 'invalid';
		if (!allowAdminPosts && (await hasAdminPosts(this.db, 'topic_id', topicIds))) return 'adminPosts';

		const postIds = (await this.db.selectFrom('posts').select('id').where('topic_id', 'in', topicIds).execute()).map((post) => post.id);
		await this.db.batch([
			this.db.deleteFrom('topics').where((eb) => eb.or([eb('id', 'in', topicIds), eb('moved_to', 'in', topicIds)])),
			this.db.deleteFrom('topic_subscriptions').where('topic_id', 'in', topicIds),
			...(await stripSearchIndexWrites(this.db, postIds)),
			...(postIds.length > 0 ? [this.db.deleteFrom('posts').where('topic_id', 'in', topicIds)] : []),
			updateForumWrite(this.db, forumId),
		]);
		return 'deleted';
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
