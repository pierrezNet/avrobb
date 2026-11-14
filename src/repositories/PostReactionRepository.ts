/**
 * Réactions sur les messages (table post_reactions, migration 0016) : compteurs et derniers noms des
 * messages d'une page, liste des membres ayant réagi, messages les plus appréciés de la semaine.
 */

import { sql } from 'kysely';
import { chunks, ITEMS_PER_QUERY } from '../db/d1Dialect.ts';
import type { Db } from '../db/database.ts';
import { type PostReactions, RECENT_REACTORS, type ReactionKey, type Reactor, readReaction } from '../services/reactions.ts';
import { forumReadable } from './forumPermissions.ts';

/** Message en tête de la colonne de l'accueil. */
export interface AppreciatedPost {
	postId: number;
	topicId: number;
	subject: string;
	poster: string;
	message: string;
	/** Réactions reçues depuis la date demandée. */
	score: number;
}

export interface PostReactionReader {
	/** Compteurs des messages, réaction du lecteur (0 pour un invité) et derniers noms. */
	forPosts(postIds: readonly number[], viewerId: number): Promise<Map<number, PostReactions>>;
	/** Membres ayant réagi, du plus récent au plus ancien ; `filter` : une réaction, null pour toutes. */
	listReactors(postId: number, filter: ReactionKey | null, offset: number, limit: number): Promise<Reactor[]>;
	/** Messages lisibles par le groupe, les plus appréciés depuis `since`. */
	listAppreciated(groupId: number, since: number, limit: number): Promise<AppreciatedPost[]>;
}

export interface PostReactionWriter {
	/** Enregistre la réaction d'un membre (null : retirée). */
	save(postId: number, userId: number, reaction: ReactionKey | null, now: number): Promise<void>;
	/** Tâche de nuit : réactions des messages supprimés (suppression d'un message, d'un sujet, élagage…). */
	purgeOrphans(): Promise<void>;
}

export class PostReactionRepository implements PostReactionReader, PostReactionWriter {
	constructor(private readonly db: Db) {}

	async forPosts(postIds: readonly number[], viewerId: number): Promise<Map<number, PostReactions>> {
		const found = new Map<
			number,
			{ counts: Partial<Record<ReactionKey, number>>; mine: ReactionKey | null; reactors: number; recent: string[] }
		>();
		const entry = (postId: number) => {
			const current = found.get(postId) ?? { counts: {}, mine: null, reactors: 0, recent: [] };
			found.set(postId, current);
			return current;
		};
		for (const part of chunks([...new Set(postIds)], ITEMS_PER_QUERY)) {
			const [rows, recent] = await Promise.all([
				this.db
					.selectFrom('post_reactions')
					.select(['post_id', 'reaction'])
					.select((eb) => [eb.fn.countAll<number>().as('total'), eb.fn.max(sql<number>`user_id = ${viewerId}`).as('mine')])
					.where('post_id', 'in', part)
					.groupBy(['post_id', 'reaction'])
					.execute(),
				this.db
					.selectFrom((eb) =>
						eb
							.selectFrom('post_reactions as r')
							.innerJoin('users as u', 'u.id', 'r.user_id')
							.select(['r.post_id', 'u.username'])
							.select(sql<number>`row_number() OVER (PARTITION BY r.post_id ORDER BY r.created DESC, r.user_id DESC)`.as('rank'))
							.where('r.post_id', 'in', part)
							.where('r.user_id', '!=', viewerId)
							.as('ranked'),
					)
					.select(['post_id', 'username'])
					.where('rank', '<=', RECENT_REACTORS)
					.orderBy('post_id')
					.orderBy('rank')
					.execute(),
			]);
			for (const row of rows) {
				const key = readReaction(row.reaction);
				if (key === null) continue;
				const current = entry(row.post_id);
				current.counts[key] = Number(row.total);
				current.reactors += Number(row.total);
				if (Number(row.mine) === 1) current.mine = key;
			}
			for (const row of recent) entry(row.post_id).recent.push(row.username);
		}
		return found;
	}

	async listReactors(postId: number, filter: ReactionKey | null, offset: number, limit: number): Promise<Reactor[]> {
		let query = this.db
			.selectFrom('post_reactions as r')
			.innerJoin('users as u', 'u.id', 'r.user_id')
			.select(['r.user_id', 'u.username', 'r.reaction', 'r.created'])
			.where('r.post_id', '=', postId);
		if (filter !== null) query = query.where('r.reaction', '=', filter);
		const rows = await query.orderBy('r.created', 'desc').orderBy('r.user_id', 'desc').limit(limit).offset(offset).execute();
		return rows.flatMap((row) => {
			const reaction = readReaction(row.reaction);
			return reaction !== null ? [{ userId: row.user_id, username: row.username, reaction, reactedAt: row.created }] : [];
		});
	}

	async save(postId: number, userId: number, reaction: ReactionKey | null, now: number): Promise<void> {
		if (reaction === null) {
			await this.db.deleteFrom('post_reactions').where('post_id', '=', postId).where('user_id', '=', userId).execute();
			return;
		}
		await this.db
			.insertInto('post_reactions')
			.values({ post_id: postId, user_id: userId, reaction, created: now })
			.onConflict((conflict) => conflict.columns(['post_id', 'user_id']).doUpdateSet({ reaction, created: now }))
			.execute();
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
