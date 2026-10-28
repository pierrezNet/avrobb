/**
 * Utilisateurs dans l'administration (admin_users.php) : adresses IP d'un membre, membres ayant
 * écrit depuis une adresse, recherche multicritère.
 */

import type { Expression, ExpressionBuilder, SqlBool } from 'kysely';
import type { Db } from '../db/database.ts';
import type { Database } from '../db/schema.ts';
import type { UserSearchCriteria } from '../services/userSearch.ts';

export interface AdminUserRow {
	id: number;
	username: string;
	email: string;
	title: string;
	numPosts: number;
	adminNote: string;
	/** null si le groupe n'existe plus. */
	groupId: number | null;
	groupUserTitle: string;
}

export interface IpStat {
	ip: string;
	lastUsed: number;
	timesFound: number;
}

export interface IpPoster {
	posterId: number;
	poster: string;
	/** null pour un invité (ou un compte supprimé). */
	user: AdminUserRow | null;
}

export interface UserAdminReader {
	countIpStats(userId: number): Promise<number>;
	listIpStats(userId: number, offset: number, limit: number): Promise<IpStat[]>;
	countIpPosters(ip: string): Promise<number>;
	listIpPosters(ip: string, offset: number, limit: number): Promise<IpPoster[]>;
	countUsers(criteria: UserSearchCriteria): Promise<number>;
	searchUsers(criteria: UserSearchCriteria, offset: number, limit: number): Promise<AdminUserRow[]>;
}

const DATE_COLUMNS = {
	last_post_after: ['last_post', '>'],
	last_post_before: ['last_post', '<'],
	last_visit_after: ['last_visit', '>'],
	last_visit_before: ['last_visit', '<'],
	registered_after: ['registered', '>'],
	registered_before: ['registered', '<'],
} as const;

/** Conditions de la recherche (u.id>1 AND …), toutes paramétrées. */
function criteriaFilter(criteria: UserSearchCriteria) {
	return (eb: ExpressionBuilder<Database, 'users'>): Expression<SqlBool> => {
		const conditions: Expression<SqlBool>[] = [eb('users.id', '>', 1)];
		for (const [field, pattern] of Object.entries(criteria.patterns) as [keyof typeof criteria.patterns, string][])
			conditions.push(eb(`users.${field}`, 'like', pattern));
		for (const [name, timestamp] of Object.entries(criteria.dates) as [keyof typeof DATE_COLUMNS, number][]) {
			const [column, op] = DATE_COLUMNS[name];
			conditions.push(eb(`users.${column}`, op, timestamp));
		}
		if (criteria.postsGreater !== null) conditions.push(eb('users.num_posts', '>', criteria.postsGreater));
		if (criteria.postsLess !== null) conditions.push(eb('users.num_posts', '<', criteria.postsLess));
		if (criteria.group > -1) conditions.push(eb('users.group_id', '=', criteria.group));
		return eb.and(conditions);
	};
}

const USER_COLUMNS = [
	'users.id',
	'users.username',
	'users.email',
	'users.title',
	'users.num_posts',
	'users.admin_note',
	'groups.g_id',
	'groups.g_user_title',
] as const;

function toRow(row: {
	id: number;
	username: string;
	email: string;
	title: string | null;
	num_posts: number;
	admin_note: string | null;
	g_id: number | null;
	g_user_title: string | null;
}): AdminUserRow {
	return {
		id: row.id,
		username: row.username,
		email: row.email,
		title: row.title ?? '',
		numPosts: row.num_posts,
		adminNote: row.admin_note ?? '',
		groupId: row.g_id,
		groupUserTitle: row.g_user_title ?? '',
	};
}

export class UserAdminRepository implements UserAdminReader {
	constructor(private readonly db: Db) {}

	async countIpStats(userId: number): Promise<number> {
		const rows = await this.db.selectFrom('posts').select('poster_ip').where('poster_id', '=', userId).groupBy('poster_ip').execute();
		return rows.length;
	}

	async listIpStats(userId: number, offset: number, limit: number): Promise<IpStat[]> {
		const rows = await this.db
			.selectFrom('posts')
			.select((eb) => ['poster_ip', eb.fn.max('posted').as('last_used'), eb.fn.count<number>('id').as('used_times')])
			.where('poster_id', '=', userId)
			.groupBy('poster_ip')
			.orderBy('last_used', 'desc')
			.offset(offset)
			.limit(limit)
			.execute();
		return rows.map((row) => ({ ip: row.poster_ip ?? '', lastUsed: Number(row.last_used), timesFound: Number(row.used_times) }));
	}

	async countIpPosters(ip: string): Promise<number> {
		const rows = await this.db.selectFrom('posts').select(['poster_id', 'poster']).distinct().where('poster_ip', '=', ip).execute();
		return rows.length;
	}

	async listIpPosters(ip: string, offset: number, limit: number): Promise<IpPoster[]> {
		const posters = await this.db
			.selectFrom('posts')
			.select(['poster_id', 'poster'])
			.distinct()
			.where('poster_ip', '=', ip)
			.orderBy('poster')
			.offset(offset)
			.limit(limit)
			.execute();
		if (posters.length === 0) return [];
		const users = await this.db
			.selectFrom('users')
			.innerJoin('groups', 'groups.g_id', 'users.group_id')
			.select(USER_COLUMNS)
			.where('users.id', '>', 1)
			.where(
				'users.id',
				'in',
				posters.map((p) => p.poster_id),
			)
			.execute();
		const byId = new Map(users.map((user) => [user.id, toRow(user)]));
		return posters.map((p) => ({ posterId: p.poster_id, poster: p.poster, user: byId.get(p.poster_id) ?? null }));
	}

	async countUsers(criteria: UserSearchCriteria): Promise<number> {
		const row = await this.db
			.selectFrom('users')
			.select((eb) => eb.fn.count<number>('users.id').as('total'))
			.where(criteriaFilter(criteria))
			.executeTakeFirstOrThrow();
		return Number(row.total);
	}

	async searchUsers(criteria: UserSearchCriteria, offset: number, limit: number): Promise<AdminUserRow[]> {
		const rows = await this.db
			.selectFrom('users')
			.where(criteriaFilter(criteria))
			.leftJoin('groups', 'groups.g_id', 'users.group_id')
			.select(USER_COLUMNS)
			.orderBy(`users.${criteria.orderBy}`, criteria.descending ? 'desc' : 'asc')
			.offset(offset)
			.limit(limit)
			.execute();
		return rows.map(toRow);
	}
}
