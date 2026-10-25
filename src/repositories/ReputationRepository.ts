/**
 * Renommée (mod Reputation de PV) : votes reçus (table reputation) et totaux recopiés dans
 * users.rep_plus et users.rep_minus, que viewtopic affiche sous chaque auteur.
 */

import type { Db } from '../db/database.ts';
import { GUEST_USER_ID, type ReputationTarget, type ReputationVote } from '../domain/models.ts';
import { forumReadable } from './forumPermissions.ts';
import { inTransaction } from './transactions.ts';

export interface ReputationMember {
	id: number;
	username: string;
	plus: number;
	minus: number;
}

export interface NewVote {
	userId: number;
	fromUserId: number;
	postId: number;
	topicId: number;
	reason: string;
	plus: boolean;
	time: number;
}

export interface ReputationStore {
	findMember(userId: number): Promise<ReputationMember | null>;
	countVotes(userId: number): Promise<number>;
	listVotes(userId: number, offset: number, limit: number): Promise<ReputationVote[]>;
	/** Message lisible par le groupe du votant, avec son auteur inscrit ; null sinon. */
	findTarget(postId: number, groupId: number): Promise<ReputationTarget | null>;
	/** Date du dernier vote de ce membre pour cet autre membre, ou null. */
	lastVoteTime(fromUserId: number, userId: number): Promise<number | null>;
	addVote(vote: NewVote): Promise<void>;
	/** Supprime des votes reçus par le membre et recalcule ses totaux. */
	deleteVotes(userId: number, voteIds: readonly number[]): Promise<void>;
}

export class ReputationRepository implements ReputationStore {
	constructor(private readonly db: Db) {}

	async findMember(userId: number): Promise<ReputationMember | null> {
		const row = await this.db
			.selectFrom('users')
			.select(['id', 'username', 'rep_plus', 'rep_minus'])
			.where('id', '=', userId)
			.where('id', '>', GUEST_USER_ID)
			.executeTakeFirst();
		return row !== undefined ? { id: row.id, username: row.username, plus: row.rep_plus, minus: row.rep_minus } : null;
	}

	async countVotes(userId: number): Promise<number> {
		const row = await this.db
			.selectFrom('reputation')
			.select((eb) => eb.fn.countAll<number>().as('total'))
			.where('user_id', '=', userId)
			.executeTakeFirstOrThrow();
		return Number(row.total);
	}

	async listVotes(userId: number, offset: number, limit: number): Promise<ReputationVote[]> {
		const rows = await this.db
			.selectFrom('reputation as r')
			.leftJoin('topics as t', 't.id', 'r.topics_id')
			.leftJoin('users as u', 'u.id', 'r.from_user_id')
			.select(['r.id', 'r.time', 'r.reason', 'r.post_id', 'r.rep_plus', 't.subject', 'u.id as from_id', 'u.username as from_name'])
			.where('r.user_id', '=', userId)
			.orderBy('r.time', 'desc')
			.orderBy('r.id', 'desc')
			.limit(limit)
			.offset(offset)
			.execute();
		return rows.map((row) => ({
			id: row.id,
			time: row.time,
			reason: row.reason ?? '',
			postId: row.post_id,
			subject: row.subject,
			plus: row.rep_plus === 1,
			from: row.from_id !== null && row.from_name !== null ? { id: row.from_id, username: row.from_name } : null,
		}));
	}

	async findTarget(postId: number, groupId: number): Promise<ReputationTarget | null> {
		const row = await this.db
			.selectFrom('posts as p')
			.innerJoin('topics as t', 't.id', 'p.topic_id')
			.innerJoin('forums as f', 'f.id', 't.forum_id')
			.innerJoin('users as u', 'u.id', 'p.poster_id')
			.leftJoin('forum_perms as fp', (join) => join.onRef('fp.forum_id', '=', 'f.id').on('fp.group_id', '=', groupId))
			.select(['p.id', 'p.topic_id', 'u.id as author_id', 'u.username', 'u.reputation_enable'])
			.where('p.id', '=', postId)
			.where('p.poster_id', '>', GUEST_USER_ID)
			.where(forumReadable)
			.executeTakeFirst();
		return row !== undefined
			? {
					postId: row.id,
					topicId: row.topic_id,
					authorId: row.author_id,
					authorName: row.username,
					authorReputationEnabled: row.reputation_enable === 1,
				}
			: null;
	}

	async lastVoteTime(fromUserId: number, userId: number): Promise<number | null> {
		const row = await this.db
			.selectFrom('reputation')
			.select((eb) => eb.fn.max('time').as('last'))
			.where('from_user_id', '=', fromUserId)
			.where('user_id', '=', userId)
			.executeTakeFirst();
		return row?.last ?? null;
	}

	addVote(vote: NewVote): Promise<void> {
		return inTransaction(this.db, async (trx) => {
			await trx
				.insertInto('reputation')
				.values({
					user_id: vote.userId,
					from_user_id: vote.fromUserId,
					time: vote.time,
					post_id: vote.postId,
					reason: vote.reason,
					topics_id: vote.topicId,
					rep_plus: vote.plus ? 1 : 0,
					rep_minus: vote.plus ? 0 : 1,
				})
				.execute();
			await trx
				.updateTable('users')
				.set((eb) => (vote.plus ? { rep_plus: eb('rep_plus', '+', 1) } : { rep_minus: eb('rep_minus', '+', 1) }))
				.where('id', '=', vote.userId)
				.execute();
		});
	}

	deleteVotes(userId: number, voteIds: readonly number[]): Promise<void> {
		if (voteIds.length === 0) return Promise.resolve();
		return inTransaction(this.db, async (trx) => {
			await trx.deleteFrom('reputation').where('user_id', '=', userId).where('id', 'in', voteIds).execute();
			const sums = await trx
				.selectFrom('reputation')
				.select((eb) => [eb.fn.sum<number>('rep_plus').as('plus'), eb.fn.sum<number>('rep_minus').as('minus')])
				.where('user_id', '=', userId)
				.executeTakeFirst();
			await trx
				.updateTable('users')
				.set({ rep_plus: Number(sums?.plus ?? 0), rep_minus: Number(sums?.minus ?? 0) })
				.where('id', '=', userId)
				.execute();
		});
	}
}
