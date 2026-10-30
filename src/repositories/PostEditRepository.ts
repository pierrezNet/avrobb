/**
 * Modification et suppression d'un message (edit.php, delete.php) : lecture du message avec son
 * sujet et son forum, puis écritures en transaction avec les effets de bord du PHP (sujet et liens
 * des sujets déplacés, index de recherche, delete_post(), delete_topic(), update_forum()).
 */

import type { RawBuilder } from 'kysely';
import type { Compilable, Db } from '../db/database.ts';
import { type EditablePost, GroupId } from '../domain/models.ts';
import { parseModerators } from '../services/moderators.ts';
import type { IndexedWords } from '../services/searchIndex.ts';
import { updateForumWrite } from './forumCounters.ts';
import { forumReadable } from './forumPermissions.ts';
import { searchIndexWrites, stripSearchIndexWrites } from './searchIndexSql.ts';

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
		await this.db.batch([
			...(update.topic !== null
				? [
						// Le sujet et ses liens laissés par un déplacement (moved_to) changent ensemble.
						this.db
							.updateTable('topics')
							.set({ subject: update.topic.subject, sticky: update.topic.sticky ? 1 : 0 })
							.where((eb) => eb.or([eb('id', '=', update.topicId), eb('moved_to', '=', update.topicId)])),
					]
				: []),
			...(await searchIndexWrites(this.db, 'edit', update.postId, update.words)),
			this.db
				.updateTable('posts')
				.set({
					message: update.message,
					hide_smilies: update.hideSmilies ? 1 : 0,
					...(update.edited !== null ? { edited: update.edited.at, edited_by: update.edited.by } : {}),
				})
				.where('id', '=', update.postId),
		]);
	}

	async deletePost(post: EditablePost): Promise<number | null> {
		const previous = await this.db
			.selectFrom('posts')
			.select('id')
			.where('topic_id', '=', post.topic.id)
			.where('id', '<', post.id)
			.orderBy('id', 'desc')
			.limit(1)
			.executeTakeFirst();
		await this.db.batch([...(await deletePostWrites(this.db, post.id, post.topic.id)), updateForumWrite(this.db, post.forum.id)]);
		return previous?.id ?? null;
	}

	async deleteTopic(post: EditablePost): Promise<void> {
		await this.db.batch([...(await deleteTopicWrites(this.db, post.topic.id)), updateForumWrite(this.db, post.forum.id)]);
	}
}

/**
 * Nombre de réponses et dernier message d'un sujet, recalculés d'après ses messages au moment où le
 * lot s'exécute (delete_post() reprenait l'avant-dernier message si le dernier était supprimé ; le
 * recalcul donne le même résultat et reste juste si plusieurs messages partent dans le même lot).
 */
export function recountTopicWrite(db: Db, topicId: number | RawBuilder<number>): Compilable {
	const latest = () => db.selectFrom('posts').where('topic_id', '=', topicId).orderBy('id', 'desc').limit(1);
	return db
		.updateTable('topics')
		.set((eb) => ({
			// Le message d'ouverture n'est pas une réponse.
			num_replies: eb
				.selectFrom('posts')
				.select((sub) => sub(sub.fn.countAll<number>(), '-', 1).as('n'))
				.where('topic_id', '=', topicId),
			last_post: latest().select('posted'),
			last_post_id: latest().select('id'),
			last_poster: latest().select('poster'),
		}))
		.where('id', '=', topicId);
}

/** delete_post() : le message, son index, puis le sujet recompté. */
export async function deletePostWrites(db: Db, postId: number, topicId: number): Promise<Compilable[]> {
	return [db.deleteFrom('posts').where('id', '=', postId), ...(await stripSearchIndexWrites(db, [postId])), recountTopicWrite(db, topicId)];
}

/** delete_topic() : sujet, liens de déplacement, messages, index et abonnements. */
export async function deleteTopicWrites(db: Db, topicId: number): Promise<Compilable[]> {
	const postIds = (await db.selectFrom('posts').select('id').where('topic_id', '=', topicId).execute()).map((post) => post.id);
	return [
		db.deleteFrom('topics').where((eb) => eb.or([eb('id', '=', topicId), eb('moved_to', '=', topicId)])),
		...(await stripSearchIndexWrites(db, postIds)),
		...(postIds.length > 0 ? [db.deleteFrom('posts').where('topic_id', '=', topicId)] : []),
		db.deleteFrom('topic_subscriptions').where('topic_id', '=', topicId),
	];
}
