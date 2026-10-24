/**
 * Statistiques du forum (bas de l'index) et membres en ligne.
 */

import { sql } from 'kysely';
import type { Db } from '../db/database.ts';
import type { OnlineVisitor, UsersInfo } from '../domain/models.ts';

/** Groupe des comptes en attente de validation (PUN_UNVERIFIED). */
const UNVERIFIED_GROUP = 0;

export interface StatsReader {
	/** Totaux des forums (SUM(num_topics), SUM(num_posts)). */
	countTopicsAndPosts(): Promise<{ topics: number; posts: number }>;
	/** Membres actifs et invités (online.idle = 0), triés par identifiant comme index.php. */
	listOnline(): Promise<OnlineVisitor[]>;
}

export interface UsersInfoSource {
	/** generate_users_info_cache() : membres hors invité et non validés, dernier inscrit. */
	loadUsersInfo(): Promise<UsersInfo>;
}

export class StatsRepository implements StatsReader, UsersInfoSource {
	constructor(private readonly db: Db) {}

	async countTopicsAndPosts(): Promise<{ topics: number; posts: number }> {
		const row = await this.db
			.selectFrom('forums')
			.select([sql<string | null>`SUM(num_topics)`.as('topics'), sql<string | null>`SUM(num_posts)`.as('posts')])
			.executeTakeFirstOrThrow();
		return { topics: Number(row.topics ?? 0), posts: Number(row.posts ?? 0) };
	}

	async listOnline(): Promise<OnlineVisitor[]> {
		const rows = await this.db.selectFrom('online').select(['user_id', 'ident']).where('idle', '=', 0).orderBy('ident').execute();
		return rows.map((row) => ({ userId: row.user_id, ident: row.ident }));
	}

	async loadUsersInfo(): Promise<UsersInfo> {
		const [count, newest] = await Promise.all([
			this.db
				.selectFrom('users')
				.select((eb) => eb.fn.countAll<number>().as('total'))
				.where('group_id', '!=', UNVERIFIED_GROUP)
				.executeTakeFirstOrThrow(),
			this.db
				.selectFrom('users')
				.select(['id', 'username'])
				.where('group_id', '!=', UNVERIFIED_GROUP)
				.orderBy('registered', 'desc')
				.limit(1)
				.executeTakeFirst(),
		]);

		// COUNT(id)-1 dans le PHP : l'invité (id 1) ne compte pas.
		return { totalUsers: Number(count.total) - 1, newestUser: newest ?? null };
	}
}
