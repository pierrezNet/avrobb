/**
 * Utilisateurs dans l'administration (admin_users.php) : adresses IP d'un membre, membres ayant
 * écrit depuis une adresse, recherche multicritère, et actions groupées (changement de groupe,
 * suppression, bannissement) avec les effets de bord du PHP.
 */

import type { Expression, ExpressionBuilder, SqlBool } from 'kysely';
import type { Compilable, Db } from '../db/database.ts';
import type { Database } from '../db/schema.ts';
import { GroupId, GUEST_USER_ID } from '../domain/models.ts';
import { parseModerators, serializeModerators } from '../services/moderators.ts';
import type { UserSearchCriteria } from '../services/userSearch.ts';
import { updateForumWrite } from './forumCounters.ts';
import { recountTopicWrite } from './PostEditRepository.ts';
import { stripSearchIndexWrites } from './searchIndexSql.ts';

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

export interface UserBan {
	message: string | null;
	expire: number | null;
	/** Bannir aussi l'adresse IP (dernier message, sinon inscription). */
	withIp: boolean;
	creatorId: number;
}

export interface UserAdminWriter {
	/** Nombre de comptes administrateurs, et de comptes d'un groupe de modérateurs, parmi `ids`. */
	countPrivileged(ids: readonly number[]): Promise<{ admins: number; moderators: number }>;
	/** Groupes proposés pour un changement de groupe (ni invités ni administrateurs), par nom. */
	listMoveTargets(): Promise<{ id: number; title: string; isModerator: boolean }[]>;
	moveUsers(ids: readonly number[], groupId: number, toModeratorGroup: boolean): Promise<void>;
	/** Supprime les comptes ; leurs messages aussi si `withPosts`, sinon ils passent à l'invité. */
	deleteUsers(ids: readonly number[], withPosts: boolean): Promise<void>;
	banUsers(ids: readonly number[], ban: UserBan): Promise<void>;
}

/**
 * Retire des listes de modérateurs des forums les comptes de groupes modérateurs parmi `ids`
 * (boucle sur les forums d'admin_users.php).
 */
/** Membres retirés des listes de modérateurs des forums (les lectures ici, les écritures renvoyées). */
async function removeFromModeratorsWrites(db: Db, ids: readonly number[]): Promise<Compilable[]> {
	const moderators = await db
		.selectFrom('users')
		.innerJoin('groups', 'groups.g_id', 'users.group_id')
		.select('users.id')
		.where('users.id', 'in', ids)
		.where('groups.g_moderator', '=', 1)
		.execute();
	if (moderators.length === 0) return [];
	const removed = new Set(moderators.map((row) => row.id));
	const writes: Compilable[] = [];
	for (const forum of await db.selectFrom('forums').select(['id', 'moderators']).execute()) {
		const current = parseModerators(forum.moderators);
		const kept = [...current].filter(([, id]) => !removed.has(id));
		if (kept.length !== current.size)
			writes.push(
				db
					.updateTable('forums')
					.set({ moderators: serializeModerators(new Map(kept)) })
					.where('id', '=', forum.id),
			);
	}
	return writes;
}

/**
 * Messages des membres supprimés avec eux : un sujet qu'ils ont ouvert part en entier (delete_topic()),
 * leurs autres messages un par un (delete_post()) ; sujets restants et forums sont ensuite recomptés.
 */
async function deletePostsOfWrites(db: Db, ids: readonly number[]): Promise<Compilable[]> {
	const posts = await db
		.selectFrom('posts as p')
		.innerJoin('topics as t', 't.id', 'p.topic_id')
		.select(['p.id', 'p.topic_id', 't.forum_id', 't.first_post_id'])
		.where('p.poster_id', 'in', ids)
		.execute();
	if (posts.length === 0) return [];

	const deletedTopics = [...new Set(posts.filter((post) => post.id === post.first_post_id).map((post) => post.topic_id))];
	const keptTopics = [...new Set(posts.filter((post) => !deletedTopics.includes(post.topic_id)).map((post) => post.topic_id))];
	const singlePosts = posts.filter((post) => !deletedTopics.includes(post.topic_id)).map((post) => post.id);
	const topicPosts =
		deletedTopics.length > 0
			? (await db.selectFrom('posts').select('id').where('topic_id', 'in', deletedTopics).execute()).map((row) => row.id)
			: [];
	const forums = [...new Set(posts.map((post) => post.forum_id))];

	return [
		...(await stripSearchIndexWrites(db, [...topicPosts, ...singlePosts])),
		...(deletedTopics.length > 0
			? [
					db.deleteFrom('topics').where((eb) => eb.or([eb('id', 'in', deletedTopics), eb('moved_to', 'in', deletedTopics)])),
					db.deleteFrom('posts').where('topic_id', 'in', deletedTopics),
					db.deleteFrom('topic_subscriptions').where('topic_id', 'in', deletedTopics),
				]
			: []),
		...(singlePosts.length > 0 ? [db.deleteFrom('posts').where('id', 'in', singlePosts)] : []),
		...keptTopics.map((topicId) => recountTopicWrite(db, topicId)),
		...forums.map((forumId) => updateForumWrite(db, forumId)),
	];
}

export class UserAdminRepository implements UserAdminReader, UserAdminWriter {
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

	async countPrivileged(ids: readonly number[]): Promise<{ admins: number; moderators: number }> {
		if (ids.length === 0) return { admins: 0, moderators: 0 };
		const rows = await this.db
			.selectFrom('users')
			.innerJoin('groups', 'groups.g_id', 'users.group_id')
			.select(['users.group_id', 'groups.g_moderator'])
			.where('users.id', 'in', ids)
			.execute();
		return {
			admins: rows.filter((row) => row.group_id === GroupId.Admin).length,
			moderators: rows.filter((row) => row.g_moderator === 1).length,
		};
	}

	async listMoveTargets(): Promise<{ id: number; title: string; isModerator: boolean }[]> {
		const rows = await this.db
			.selectFrom('groups')
			.select(['g_id', 'g_title', 'g_moderator'])
			.where('g_id', 'not in', [GroupId.Guest, GroupId.Admin])
			.orderBy('g_title')
			.execute();
		return rows.map((row) => ({ id: row.g_id, title: row.g_title, isModerator: row.g_moderator === 1 }));
	}

	async moveUsers(ids: readonly number[], groupId: number, toModeratorGroup: boolean): Promise<void> {
		await this.db.batch([
			...(toModeratorGroup ? [] : await removeFromModeratorsWrites(this.db, ids)),
			this.db.updateTable('users').set({ group_id: groupId }).where('id', 'in', ids),
		]);
	}

	async deleteUsers(ids: readonly number[], withPosts: boolean): Promise<void> {
		await this.db.batch([
			...(await removeFromModeratorsWrites(this.db, ids)),
			this.db.deleteFrom('topic_subscriptions').where('user_id', 'in', ids),
			this.db.deleteFrom('forum_subscriptions').where('user_id', 'in', ids),
			this.db.deleteFrom('online').where('user_id', 'in', ids),
			...(withPosts
				? await deletePostsOfWrites(this.db, ids)
				: [this.db.updateTable('posts').set({ poster_id: GUEST_USER_ID }).where('poster_id', 'in', ids)]),
			this.db.deleteFrom('users').where('id', 'in', ids),
		]);
	}

	async banUsers(ids: readonly number[], ban: UserBan): Promise<void> {
		{
			const users = await this.db
				.selectFrom('users')
				.select(['id', 'username', 'email', 'registration_ip'])
				.where('id', 'in', ids)
				.execute();
			const ips = new Map(users.map((user) => [user.id, user.registration_ip]));
			if (ban.withIp) {
				// Adresse du dernier message de chacun, à défaut celle de l'inscription.
				const last = await this.db
					.selectFrom('posts as p')
					.innerJoin(
						(eb) =>
							eb
								.selectFrom('posts')
								.select((e) => e.fn.max('id').as('id'))
								.where('poster_id', 'in', ids)
								.groupBy('poster_id')
								.as('i'),
						(join) => join.onRef('p.id', '=', 'i.id'),
					)
					.select(['p.poster_id', 'p.poster_ip'])
					.execute();
				for (const row of last) if (row.poster_ip !== null) ips.set(row.poster_id, row.poster_ip);
			}
			if (users.length > 0)
				await this.db
					.insertInto('bans')
					.values(
						users.map((user) => ({
							username: user.username,
							ip: ban.withIp ? (ips.get(user.id) ?? null) : null,
							email: user.email,
							message: ban.message,
							expire: ban.expire,
							ban_creator: ban.creatorId,
						})),
					)
					.execute();
		}
	}
}
