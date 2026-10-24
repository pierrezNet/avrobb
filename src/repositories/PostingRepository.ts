/**
 * Rédaction (post.php) : lecture du forum ou du sujet visé, du message cité et du rappel de la
 * discussion ; création d'une réponse ou d'une discussion avec tous les effets de bord du PHP,
 * dans une seule transaction (message, sujet, abonnement, index de recherche, update_forum(),
 * compteur et promotion du membre ou date du dernier message de l'invité).
 */

import type { Kysely } from 'kysely';
import type { Db } from '../db/database.ts';
import type { Database } from '../db/schema.ts';
import { GUEST_USER_ID, type PostingTarget, type ReviewPost, type Subscriber } from '../domain/models.ts';
import { parseModerators } from '../services/phpSerialize.ts';
import type { IndexedWords } from '../services/searchIndex.ts';
import { updateForum } from './forumCounters.ts';
import { forumReadable } from './forumPermissions.ts';
import { updateSearchIndex } from './searchIndexSql.ts';
import { inTransaction } from './transactions.ts';

/** Auteur d'un nouveau message : membre (compteur, promotion) ou invité (repéré par son IP). */
export type NewPostAuthor =
	| { kind: 'member'; id: number; username: string; promoteTo: number | null }
	| { kind: 'guest'; username: string; email: string | null };

interface NewPostBase {
	author: NewPostAuthor;
	ip: string;
	message: string;
	hideSmilies: boolean;
	now: number;
	words: IndexedWords;
}

export interface NewReply extends NewPostBase {
	topicId: number;
	forumId: number;
	subscription: 'add' | 'remove' | null;
}

export interface NewTopic extends NewPostBase {
	forumId: number;
	subject: string;
	sticky: boolean;
	subscribe: boolean;
}

export interface PostingStore {
	/** Forum (nouvelle discussion) ou sujet (réponse) lisible par le groupe, avec l'abonnement du membre. */
	findTarget(target: { topicId: number } | { forumId: number }, viewer: { id: number; groupId: number }): Promise<PostingTarget | null>;
	/** Message à citer, s'il appartient bien au sujet. */
	findQuote(postId: number, topicId: number): Promise<{ poster: string; message: string } | null>;
	/** Derniers messages du sujet, plus récents d'abord. */
	listReview(topicId: number, limit: number): Promise<ReviewPost[]>;
	createReply(reply: NewReply): Promise<number>;
	createTopic(topic: NewTopic): Promise<{ topicId: number; postId: number }>;
	/** Abonnés au sujet à prévenir : venus depuis le message précédent, non bannis, lecteurs du forum. */
	listTopicSubscribers(topicId: number, forumId: number, excludeUserId: number): Promise<Subscriber[]>;
	listForumSubscribers(forumId: number, excludeUserId: number): Promise<Subscriber[]>;
}

export class PostingRepository implements PostingStore {
	constructor(private readonly db: Db) {}

	async findTarget(
		target: { topicId: number } | { forumId: number },
		viewer: { id: number; groupId: number },
	): Promise<PostingTarget | null> {
		const forumQuery = this.db
			.selectFrom('forums as f')
			.leftJoin('forum_perms as fp', (join) => join.onRef('fp.forum_id', '=', 'f.id').on('fp.group_id', '=', viewer.groupId))
			.select(['f.id', 'f.forum_name', 'f.moderators', 'f.redirect_url', 'fp.post_replies', 'fp.post_topics'])
			.where(forumReadable);

		const toTarget = (
			row: {
				id: number;
				forum_name: string;
				moderators: string | null;
				redirect_url: string | null;
				post_replies: number | null;
				post_topics: number | null;
			},
			topic: PostingTarget['topic'],
		): PostingTarget => ({
			forum: { id: row.id, name: row.forum_name, moderators: parseModerators(row.moderators), isRedirect: (row.redirect_url ?? '') !== '' },
			replyPermission: row.post_replies === null ? null : row.post_replies === 1,
			topicPermission: row.post_topics === null ? null : row.post_topics === 1,
			topic,
		});

		if ('forumId' in target) {
			const row = await forumQuery.where('f.id', '=', target.forumId).executeTakeFirst();
			return row !== undefined ? toTarget(row, null) : null;
		}

		// Écart assumé : on ne répond pas dans le lien laissé par un sujet déplacé (moved_to), que le
		// PHP acceptait alors que viewtopic ne l'affiche pas.
		const row = await forumQuery
			.innerJoin('topics as t', 't.forum_id', 'f.id')
			.leftJoin('topic_subscriptions as s', (join) => join.onRef('s.topic_id', '=', 't.id').on('s.user_id', '=', viewer.id))
			.select(['t.id as topic_id', 't.subject', 't.closed', 's.user_id as subscribed'])
			.where('t.id', '=', target.topicId)
			.where('t.moved_to', 'is', null)
			.executeTakeFirst();
		if (row === undefined) return null;
		return toTarget(row, { id: row.topic_id, subject: row.subject, closed: row.closed === 1, isSubscribed: row.subscribed !== null });
	}

	async findQuote(postId: number, topicId: number): Promise<{ poster: string; message: string } | null> {
		const row = await this.db
			.selectFrom('posts')
			.select(['poster', 'message'])
			.where('id', '=', postId)
			.where('topic_id', '=', topicId)
			.executeTakeFirst();
		return row !== undefined ? { poster: row.poster, message: row.message ?? '' } : null;
	}

	async listReview(topicId: number, limit: number): Promise<ReviewPost[]> {
		const rows = await this.db
			.selectFrom('posts')
			.select(['poster', 'message', 'hide_smilies', 'posted'])
			.where('topic_id', '=', topicId)
			.orderBy('id', 'desc')
			.limit(limit)
			.execute();
		return rows.map((row) => ({ poster: row.poster, message: row.message ?? '', hideSmilies: row.hide_smilies === 1, posted: row.posted }));
	}

	async createReply(reply: NewReply): Promise<number> {
		return inTransaction(this.db, async (trx) => {
			const postId = await insertPost(trx, reply, reply.topicId);

			if (reply.author.kind === 'member' && reply.subscription === 'add')
				await trx.insertInto('topic_subscriptions').values({ user_id: reply.author.id, topic_id: reply.topicId }).execute();
			else if (reply.author.kind === 'member' && reply.subscription === 'remove')
				await trx.deleteFrom('topic_subscriptions').where('user_id', '=', reply.author.id).where('topic_id', '=', reply.topicId).execute();

			await trx
				.updateTable('topics')
				.set((eb) => ({
					num_replies: eb('num_replies', '+', 1),
					last_post: reply.now,
					last_post_id: postId,
					last_poster: reply.author.username,
				}))
				.where('id', '=', reply.topicId)
				.execute();

			await updateSearchIndex(trx, 'post', postId, reply.words);
			await updateForum(trx, reply.forumId);
			await recordAuthorPost(trx, reply);
			return postId;
		});
	}

	async createTopic(topic: NewTopic): Promise<{ topicId: number; postId: number }> {
		return inTransaction(this.db, async (trx) => {
			const inserted = await trx
				.insertInto('topics')
				.values({
					poster: topic.author.username,
					subject: topic.subject,
					posted: topic.now,
					last_post: topic.now,
					last_poster: topic.author.username,
					sticky: topic.sticky ? 1 : 0,
					forum_id: topic.forumId,
				})
				.executeTakeFirstOrThrow();
			const topicId = Number(inserted.insertId);

			if (topic.author.kind === 'member' && topic.subscribe)
				await trx.insertInto('topic_subscriptions').values({ user_id: topic.author.id, topic_id: topicId }).execute();

			const postId = await insertPost(trx, topic, topicId);
			await trx.updateTable('topics').set({ last_post_id: postId, first_post_id: postId }).where('id', '=', topicId).execute();

			await updateSearchIndex(trx, 'post', postId, topic.words);
			await updateForum(trx, topic.forumId);
			await recordAuthorPost(trx, topic);
			return { topicId, postId };
		});
	}

	async listTopicSubscribers(topicId: number, forumId: number, excludeUserId: number): Promise<Subscriber[]> {
		// Date du message précédant la nouvelle réponse : on ne relance pas un abonné qui n'est pas revenu depuis.
		const previous = await this.db
			.selectFrom('posts')
			.select('posted')
			.where('topic_id', '=', topicId)
			.orderBy('id', 'desc')
			.limit(1)
			.offset(1)
			.executeTakeFirst();
		const previousPostTime = previous?.posted ?? 0;

		const rows = await this.db
			.selectFrom('users as u')
			.innerJoin('topic_subscriptions as s', 's.user_id', 'u.id')
			.leftJoin('forum_perms as fp', (join) => join.onRef('fp.group_id', '=', 'u.group_id').on('fp.forum_id', '=', forumId))
			.leftJoin('online as o', 'o.user_id', 'u.id')
			.leftJoin('bans as b', 'b.username', 'u.username')
			.select(['u.email', 'u.notify_with_post'])
			.where('b.username', 'is', null)
			.where((eb) => eb(eb.fn.coalesce('o.logged', 'u.last_visit'), '>', previousPostTime))
			.where(forumReadable)
			.where('s.topic_id', '=', topicId)
			.where('u.id', '!=', excludeUserId)
			.execute();
		return rows.map((row) => ({ email: row.email, notifyWithPost: row.notify_with_post === 1 }));
	}

	async listForumSubscribers(forumId: number, excludeUserId: number): Promise<Subscriber[]> {
		const rows = await this.db
			.selectFrom('users as u')
			.innerJoin('forum_subscriptions as s', 's.user_id', 'u.id')
			.leftJoin('forum_perms as fp', (join) => join.onRef('fp.group_id', '=', 'u.group_id').on('fp.forum_id', '=', forumId))
			.leftJoin('bans as b', 'b.username', 'u.username')
			.select(['u.email', 'u.notify_with_post'])
			.where('b.username', 'is', null)
			.where(forumReadable)
			.where('s.forum_id', '=', forumId)
			.where('u.id', '!=', excludeUserId)
			.execute();
		return rows.map((row) => ({ email: row.email, notifyWithPost: row.notify_with_post === 1 }));
	}
}

/** INSERT du message ; un invité n'a pas de poster_id (1 par défaut) mais peut laisser son e-mail. */
async function insertPost(trx: Kysely<Database>, post: NewPostBase, topicId: number): Promise<number> {
	const common = {
		poster: post.author.username,
		poster_ip: post.ip,
		message: post.message,
		hide_smilies: post.hideSmilies ? 1 : 0,
		posted: post.now,
		topic_id: topicId,
	};
	const values =
		post.author.kind === 'member'
			? { ...common, poster_id: post.author.id }
			: { ...common, poster_id: GUEST_USER_ID, poster_email: post.author.email };
	const result = await trx.insertInto('posts').values(values).executeTakeFirstOrThrow();
	return Number(result.insertId);
}

/** Fin de post.php : compteur, dernier message et promotion du membre, ou last_post de l'invité. */
async function recordAuthorPost(trx: Kysely<Database>, post: NewPostBase): Promise<void> {
	const { author } = post;
	if (author.kind === 'guest') {
		await trx.updateTable('online').set({ last_post: post.now }).where('ident', '=', post.ip).execute();
		return;
	}
	await trx
		.updateTable('users')
		.set((eb) => ({
			num_posts: eb('num_posts', '+', 1),
			last_post: post.now,
			...(author.promoteTo !== null ? { group_id: author.promoteTo } : {}),
		}))
		.where('id', '=', author.id)
		.execute();
}
