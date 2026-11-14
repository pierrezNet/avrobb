/**
 * « J'aime » et réactions émoji (table post_reactions, migration 0016) : compteurs des messages d'une
 * page, choix d'un membre, messages les plus appréciés de la semaine.
 */

import { sql } from 'kysely';
import { chunks, ITEMS_PER_QUERY } from '../db/d1Dialect.ts';
import type { Db } from '../db/database.ts';
import { NO_REACTIONS, type PostReactions, REACTIONS, type ReactionKey } from '../services/reactions.ts';
import { forumReadable } from './forumPermissions.ts';

/** Message en tête de la colonne de l'accueil. */
export interface AppreciatedPost {
	postId: number;
	topicId: number;
	subject: string;
	poster: string;
	message: string;
	/** « J'aime » et réactions reçus depuis la date demandée. */
	score: number;
}

export interface PostReactionReader {
	/** Compteurs des messages, et choix du lecteur (0 pour un invité). */
	forPosts(postIds: readonly number[], viewerId: number): Promise<Map<number, PostReactions>>;
	/** Messages lisibles par le groupe, les plus appréciés depuis `since`. */
	listAppreciated(groupId: number, since: number, limit: number): Promise<AppreciatedPost[]>;
}

export interface PostReactionWriter {
	/** Enregistre le choix d'un membre : « J'aime » et réaction (null : retirée). */
	save(postId: number, userId: number, choice: { liked: boolean; reaction: ReactionKey | null }, now: number): Promise<void>;
	/** Tâche de nuit : réactions des messages supprimés (suppression d'un message, d'un sujet, élagage…). */
	purgeOrphans(): Promise<void>;
}

const isReaction = (value: string): value is ReactionKey => (REACTIONS as readonly string[]).includes(value);

export class PostReactionRepository implements PostReactionReader, PostReactionWriter {
	constructor(private readonly db: Db) {}

	async forPosts(postIds: readonly number[], viewerId: number): Promise<Map<number, PostReactions>> {
		const found = new Map<
			number,
			{ likes: number; reactions: Partial<Record<ReactionKey, number>>; liked: boolean; reaction: ReactionKey | null }
		>();
		for (const part of chunks([...new Set(postIds)], ITEMS_PER_QUERY)) {
			const rows = await this.db
				.selectFrom('post_reactions')
				.select(['post_id', 'slot', 'reaction'])
				.select((eb) => [eb.fn.countAll<number>().as('total'), eb.fn.max(sql<number>`user_id = ${viewerId}`).as('mine')])
				.where('post_id', 'in', part)
				.groupBy(['post_id', 'slot', 'reaction'])
				.execute();
			for (const row of rows) {
				const entry = found.get(row.post_id) ?? { ...NO_REACTIONS, reactions: {} };
				const mine = Number(row.mine) === 1;
				if (row.slot === 'like') {
					entry.likes = Number(row.total);
					entry.liked = mine;
				} else if (isReaction(row.reaction)) {
					entry.reactions[row.reaction] = Number(row.total);
					if (mine) entry.reaction = row.reaction;
				}
				found.set(row.post_id, entry);
			}
		}
		return found;
	}

	async save(postId: number, userId: number, choice: { liked: boolean; reaction: ReactionKey | null }, now: number): Promise<void> {
		const row = (slot: 'like' | 'emoji') =>
			this.db.deleteFrom('post_reactions').where('post_id', '=', postId).where('user_id', '=', userId).where('slot', '=', slot);
		const keep = (slot: 'like' | 'emoji', reaction: string) =>
			this.db
				.insertInto('post_reactions')
				.values({ post_id: postId, user_id: userId, slot, reaction, created: now })
				.onConflict((conflict) => conflict.columns(['post_id', 'user_id', 'slot']).doUpdateSet({ reaction, created: now }));
		await this.db.batch([
			choice.liked ? keep('like', 'like') : row('like'),
			choice.reaction !== null ? keep('emoji', choice.reaction) : row('emoji'),
		]);
	}

	async purgeOrphans(): Promise<void> {
		await this.db
			.deleteFrom('post_reactions')
			.where(({ not, exists, selectFrom }) =>
				not(exists(selectFrom('posts').select('posts.id').whereRef('posts.id', '=', 'post_reactions.post_id'))),
			)
			.execute();
	}

	async listAppreciated(groupId: number, since: number, limit: number): Promise<AppreciatedPost[]> {
		const rows = await this.db
			.selectFrom('post_reactions as r')
			.innerJoin('posts as p', 'p.id', 'r.post_id')
			.innerJoin('topics as t', 't.id', 'p.topic_id')
			.innerJoin('forums as f', 'f.id', 't.forum_id')
			.leftJoin('forum_perms as fp', (join) => join.onRef('fp.forum_id', '=', 'f.id').on('fp.group_id', '=', groupId))
			.select(['p.id', 't.id as topic_id', 't.subject', 'p.poster', 'p.message'])
			.select((eb) => eb.fn.countAll<number>().as('score'))
			.where('r.created', '>=', since)
			.where(forumReadable)
			.groupBy(['p.id', 't.id', 't.subject', 'p.poster', 'p.message'])
			.orderBy('score', 'desc')
			.orderBy('p.id', 'desc')
			.limit(limit)
			.execute();
		return rows.map((row) => ({
			postId: row.id,
			topicId: row.topic_id,
			subject: row.subject,
			poster: row.poster,
			message: row.message ?? '',
			score: Number(row.score),
		}));
	}
}
