/**
 * Modification et suppression d'un message (edit.php, delete.php) : lecture du message avec son
 * sujet et son forum, puis écritures en transaction avec les effets de bord du PHP (sujet et liens
 * des sujets déplacés, index de recherche, delete_post(), delete_topic(), update_forum()).
 */

import { type Kysely, sql } from 'kysely';
import type { Db } from '../db/database.ts';
import type { Database } from '../db/schema.ts';
import { type EditablePost, GroupId } from '../domain/models.ts';
import { parseModerators } from '../services/phpSerialize.ts';
import type { IndexedWords } from '../services/searchIndex.ts';
import { updateForum } from './forumCounters.ts';
import { forumReadable } from './forumPermissions.ts';
import { stripSearchIndex, updateSearchIndex } from './searchIndexSql.ts';
import { inTransaction } from './transactions.ts';

export interface PostUpdate {
	postId: number;
	topicId: number;
	message: string;
	hideSmilies: boolean;
	/** « Dernière modification par » ; null pour une modification silencieuse de modérateur. */
	edited: { at: number; by: string } | null;
	/** Premier message : nouveau sujet et épinglage du sujet. */
	topic: { subject: string; sticky: boolean } | null;
	words: IndexedWords;
}

export interface PostEditStore {
	/** Message lisible par le groupe, ou null. */
	findPost(postId: number, groupId: number): Promise<EditablePost | null>;
	updatePost(update: PostUpdate): Promise<void>;
	/** delete_post() puis update_forum() ; renvoie le message précédent du sujet (pour y revenir). */
	deletePost(post: EditablePost): Promise<number | null>;
	/** delete_topic() puis update_forum(). */
	deleteTopic(post: EditablePost): Promise<void>;
}

export class PostEditRepository implements PostEditStore {
	constructor(private readonly db: Db) {}

	async findPost(postId: number, groupId: number): Promise<EditablePost | null> {
		const row = await this.db
			.selectFrom('posts as p')
			.innerJoin('topics as t', 't.id', 'p.topic_id')
			.innerJoin('forums as f', 'f.id', 't.forum_id')
			.leftJoin('forum_perms as fp', (join) => join.onRef('fp.forum_id', '=', 'f.id').on('fp.group_id', '=', groupId))
			.leftJoin('users as u', 'u.id', 'p.poster_id')
			.select([
				'p.id',
				'p.poster',
				'p.poster_id',
				'p.message',
				'p.hide_smilies',
				'p.posted',
				'u.group_id',
				't.id as topic_id',
				't.subject',
				't.sticky',
				't.closed',
				't.first_post_id',
				'f.id as forum_id',
				'f.forum_name',
				'f.moderators',
			])
			.where('p.id', '=', postId)
			.where(forumReadable)
			.executeTakeFirst();
		if (row === undefined) return null;
		return {
			id: row.id,
			poster: row.poster,
			posterId: row.poster_id,
			// get_admin_ids() : membres du groupe administrateurs.
			posterIsAdmin: row.group_id === GroupId.Admin,
			message: row.message ?? '',
			hideSmilies: row.hide_smilies === 1,
			posted: row.posted,
			topic: { id: row.topic_id, subject: row.subject, sticky: row.sticky === 1, closed: row.closed === 1, firstPostId: row.first_post_id },
			forum: { id: row.forum_id, name: row.forum_name, moderators: parseModerators(row.moderators) },
		};
	}

	async updatePost(update: PostUpdate): Promise<void> {
		await inTransaction(this.db, async (trx) => {
			if (update.topic !== null)
				// Le sujet et ses liens laissés par un déplacement (moved_to) changent ensemble.
				await trx
					.updateTable('topics')
					.set({ subject: update.topic.subject, sticky: update.topic.sticky ? 1 : 0 })
					.where((eb) => eb.or([eb('id', '=', update.topicId), eb('moved_to', '=', update.topicId)]))
					.execute();

			await updateSearchIndex(trx, 'edit', update.postId, update.words);

			await trx
				.updateTable('posts')
				.set({
					message: update.message,
					hide_smilies: update.hideSmilies ? 1 : 0,
					...(update.edited !== null ? { edited: update.edited.at, edited_by: update.edited.by } : {}),
				})
				.where('id', '=', update.postId)
				.execute();
		});
	}

	async deletePost(post: EditablePost): Promise<number | null> {
		return inTransaction(this.db, async (trx) => {
			await deletePost(trx, post.id, post.topic.id);
			await updateForum(trx, post.forum.id);
			const previous = await trx
				.selectFrom('posts')
				.select('id')
				.where('topic_id', '=', post.topic.id)
				.where('id', '<', post.id)
				.orderBy('id', 'desc')
				.limit(1)
				.executeTakeFirst();
			return previous?.id ?? null;
		});
	}

	async deleteTopic(post: EditablePost): Promise<void> {
		await inTransaction(this.db, async (trx) => {
			await deleteTopic(trx, post.topic.id);
			await updateForum(trx, post.forum.id);
		});
	}
}

/** delete_post() : le sujet reprend comme dernier message l'avant-dernier si c'était le dernier. */
async function deletePost(trx: Kysely<Database>, postId: number, topicId: number): Promise<void> {
	const [last, secondLast] = await trx
		.selectFrom('posts')
		.select(['id', 'poster', 'posted'])
		.where('topic_id', '=', topicId)
		.orderBy('id', 'desc')
		.limit(2)
		.execute();

	await trx.deleteFrom('posts').where('id', '=', postId).execute();
	await stripSearchIndex(trx, [postId]);

	const { count } = await trx
		.selectFrom('posts')
		.select((eb) => eb.fn.count<number>('id').as('count'))
		.where('topic_id', '=', topicId)
		.executeTakeFirstOrThrow();
	const numReplies = Number(count) - 1;

	const topics = trx.updateTable('topics').where('id', '=', topicId);
	if (last?.id !== postId) await topics.set({ num_replies: numReplies }).execute();
	else if (secondLast !== undefined)
		await topics
			.set({ last_post: secondLast.posted, last_post_id: secondLast.id, last_poster: secondLast.poster, num_replies: numReplies })
			.execute();
	// Plus aucune réponse : le dernier message redevient celui qui ouvre le sujet.
	else await topics.set({ last_post: sql`posted`, last_post_id: sql`id`, last_poster: sql`poster`, num_replies: numReplies }).execute();
}

/** delete_topic() : sujet, liens de déplacement, messages, index et abonnements. */
async function deleteTopic(trx: Kysely<Database>, topicId: number): Promise<void> {
	await trx
		.deleteFrom('topics')
		.where((eb) => eb.or([eb('id', '=', topicId), eb('moved_to', '=', topicId)]))
		.execute();

	const posts = await trx.selectFrom('posts').select('id').where('topic_id', '=', topicId).execute();
	if (posts.length > 0) {
		await stripSearchIndex(
			trx,
			posts.map((post) => post.id),
		);
		await trx.deleteFrom('posts').where('topic_id', '=', topicId).execute();
	}

	await trx.deleteFrom('topic_subscriptions').where('topic_id', '=', topicId).execute();
}
