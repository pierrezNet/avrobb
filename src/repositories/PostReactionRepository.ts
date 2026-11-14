/**
 * « J'aime » et réactions émoji (table post_reactions, migration 0016) : compteurs des messages d'une
 * page, choix d'un membre, messages les plus appréciés de la semaine.
 */

import { sql } from 'kysely';
import { chunks, ITEMS_PER_QUERY } from '../db/d1Dialect.ts';
import type { Db } from '../db/database.ts';
import {
	NO_REACTIONS,
	type PostReactions,
	REACTIONS,
	RECENT_REACTORS,
	type ReactionChoice,
	type ReactionKey,
	type Reactor,
} from '../services/reactions.ts';
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
	/** Membres ayant réagi, du plus récent au plus ancien ; `filter` : « J'aime » ou une réaction, null pour tous. */
	listReactors(postId: number, filter: ReactionChoice | null, offset: number, limit: number): Promise<Reactor[]>;
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
			{
				likes: number;
				reactions: Partial<Record<ReactionKey, number>>;
				liked: boolean;
				reaction: ReactionKey | null;
				reactors: number;
				recent: string[];
			}
		>();
		const entry = (postId: number) => {
			const current = found.get(postId) ?? { ...NO_REACTIONS, reactions: {}, recent: [] };
			found.set(postId, current);
			return current;
		};
		for (const part of chunks([...new Set(postIds)], ITEMS_PER_QUERY)) {
			const [rows, people, recent] = await Promise.all([
				this.db
					.selectFrom('post_reactions')
					.select(['post_id', 'slot', 'reaction'])
					.select((eb) => [eb.fn.countAll<number>().as('total'), eb.fn.max(sql<number>`user_id = ${viewerId}`).as('mine')])
					.where('post_id', 'in', part)
					.groupBy(['post_id', 'slot', 'reaction'])
					.execute(),
				this.db
					.selectFrom('post_reactions')
					.select('post_id')
					.select((eb) => eb.fn.count<number>('user_id').distinct().as('reactors'))
					.where('post_id', 'in', part)
					.groupBy('post_id')
					.execute(),
				this.db
					.selectFrom((eb) =>
						eb
							.selectFrom('post_reactions as r')
							.innerJoin('users as u', 'u.id', 'r.user_id')
							.select(['r.post_id', 'u.username'])
							.select(sql<number>`row_number() OVER (PARTITION BY r.post_id ORDER BY max(r.created) DESC, r.user_id DESC)`.as('rank'))
							.where('r.post_id', 'in', part)
							.where('r.user_id', '!=', viewerId)
							.groupBy(['r.post_id', 'r.user_id', 'u.username'])
							.as('ranked'),
					)
					.select(['post_id', 'username'])
					.where('rank', '<=', RECENT_REACTORS)
					.orderBy('post_id')
					.orderBy('rank')
					.execute(),
			]);
			for (const row of rows) {
				const current = entry(row.post_id);
				const mine = Number(row.mine) === 1;
				if (row.slot === 'like') {
					current.likes = Number(row.total);
					current.liked = mine;
				} else if (isReaction(row.reaction)) {
					current.reactions[row.reaction] = Number(row.total);
					if (mine) current.reaction = row.reaction;
				}
			}
			for (const row of people) entry(row.post_id).reactors = Number(row.reactors);
			for (const row of recent) entry(row.post_id).recent.push(row.username);
		}
		return found;
	}

	async listReactors(postId: number, filter: ReactionChoice | null, offset: number, limit: number): Promise<Reactor[]> {
		let query = this.db
			.selectFrom('post_reactions as r')
			.innerJoin('users as u', 'u.id', 'r.user_id')
			.select(['r.user_id', 'u.username'])
			.select((eb) => [
				sql<number>`max(r.slot = 'like')`.as('liked'),
				sql<string | null>`max(CASE WHEN r.slot = 'emoji' THEN r.reaction END)`.as('reaction'),
				eb.fn.max('r.created').as('reacted_at'),
			])
			.where('r.post_id', '=', postId)
			.groupBy(['r.user_id', 'u.username']);
		if (filter?.kind === 'like') query = query.having(sql<number>`max(r.slot = 'like')`, '=', 1);
		else if (filter?.kind === 'emoji') query = query.having(sql<number>`max(r.slot = 'emoji' AND r.reaction = ${filter.reaction})`, '=', 1);
		const rows = await query.orderBy('reacted_at', 'desc').orderBy('r.user_id', 'desc').limit(limit).offset(offset).execute();
		return rows.map((row) => ({
			userId: row.user_id,
			username: row.username,
			liked: Number(row.liked) === 1,
			reaction: row.reaction !== null && isReaction(row.reaction) ? row.reaction : null,
			reactedAt: Number(row.reacted_at),
		}));
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
