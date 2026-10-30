/**
 * Bannissements (table bans). Pour l'affichage, seuls les pseudos bannis servent : get_title()
 * donne le titre « En vacances » à leurs auteurs, que le bannissement soit expiré ou non (comme
 * $pun_bans, qui n'est purgé des bannissements expirés qu'au passage de check_bans()).
 */

import type { Expression, ExpressionBuilder, SqlBool } from 'kysely';
import type { Db } from '../db/database.ts';
import type { Database } from '../db/schema.ts';
import type { BanSearchCriteria, BanValues } from '../services/banForm.ts';
import type { Ban } from '../services/bans.ts';

export interface BanReader {
	/** Pseudos bannis, en minuscules. */
	listBannedUsernames(): Promise<Set<string>>;
	/** Tous les bannissements, dans l'ordre de la table ($pun_bans). */
	listBans(): Promise<Ban[]>;
}

export interface BanWriter {
	/** Supprime des bannissements échus (check_bans()). */
	deleteBans(ids: readonly number[]): Promise<void>;
}

/** Compte visé par un bannissement (admin_bans.php). */
export interface BanTarget {
	id: number;
	username: string;
	email: string;
	groupId: number;
	isModerator: boolean;
}

export interface BanListItem extends BanValues {
	id: number;
	/** null si le créateur n'existe plus. */
	creator: { id: number; username: string } | null;
}

/** Bannissements gérés dans l'administration. */
export interface BanStore {
	findBan(id: number): Promise<(BanValues & { id: number }) | null>;
	addBan(ban: BanValues, creatorId: number): Promise<void>;
	updateBan(id: number, ban: BanValues): Promise<void>;
	removeBan(id: number): Promise<void>;
	/** Compte par identifiant ou par nom (id > 1), avec le statut de son groupe. */
	findTarget(by: { id: number } | { username: string }): Promise<BanTarget | null>;
	/** Adresse du dernier message, sinon d'inscription. */
	lastKnownIp(userId: number): Promise<string>;
	countBans(criteria: BanSearchCriteria): Promise<number>;
	searchBans(criteria: BanSearchCriteria, offset: number, limit: number): Promise<BanListItem[]>;
}

function banFilter(criteria: BanSearchCriteria) {
	return (eb: ExpressionBuilder<Database, 'bans'>): Expression<SqlBool> => {
		const conditions: Expression<SqlBool>[] = [eb('bans.id', '>', 0)];
		for (const [field, pattern] of Object.entries(criteria.patterns) as [keyof typeof criteria.patterns, string][])
			conditions.push(eb(`bans.${field}`, 'like', pattern));
		if (criteria.expireAfter !== null) conditions.push(eb('bans.expire', '>', criteria.expireAfter));
		if (criteria.expireBefore !== null) conditions.push(eb('bans.expire', '<', criteria.expireBefore));
		return eb.and(conditions);
	};
}

const nullable = (value: string | null): string | null => (value !== null && value !== '' ? value : null);

export class BanRepository implements BanReader, BanWriter, BanStore {
	constructor(private readonly db: Db) {}

	async listBannedUsernames(): Promise<Set<string>> {
		const rows = await this.db
			.selectFrom('bans')
			.select('username')
			.where('username', 'is not', null)
			.where('username', '!=', '')
			.execute();
		return new Set(rows.map((row) => (row.username ?? '').toLowerCase()));
	}

	async listBans(): Promise<Ban[]> {
		const rows = await this.db.selectFrom('bans').select(['id', 'username', 'ip', 'email', 'message', 'expire']).orderBy('id').execute();
		return rows.map((row) => ({
			id: row.id,
			username: row.username ?? '',
			ip: row.ip ?? '',
			email: row.email ?? '',
			message: row.message ?? '',
			expire: row.expire,
		}));
	}

	async deleteBans(ids: readonly number[]): Promise<void> {
		if (ids.length > 0) await this.db.deleteFrom('bans').where('id', 'in', ids).execute();
	}

	async findBan(id: number): Promise<(BanValues & { id: number }) | null> {
		const row = await this.db
			.selectFrom('bans')
			.select(['id', 'username', 'ip', 'email', 'message', 'expire'])
			.where('id', '=', id)
			.executeTakeFirst();
		return row !== undefined
			? {
					id: row.id,
					username: nullable(row.username),
					ip: nullable(row.ip),
					email: nullable(row.email),
					message: nullable(row.message),
					expire: row.expire,
				}
			: null;
	}

	async addBan(ban: BanValues, creatorId: number): Promise<void> {
		await this.db
			.insertInto('bans')
			.values({ ...ban, ban_creator: creatorId })
			.execute();
	}

	async updateBan(id: number, ban: BanValues): Promise<void> {
		await this.db.updateTable('bans').set(ban).where('id', '=', id).execute();
	}

	async removeBan(id: number): Promise<void> {
		await this.db.deleteFrom('bans').where('id', '=', id).execute();
	}

	async findTarget(by: { id: number } | { username: string }): Promise<BanTarget | null> {
		let query = this.db
			.selectFrom('users')
			.innerJoin('groups', 'groups.g_id', 'users.group_id')
			.select(['users.id', 'users.username', 'users.email', 'users.group_id', 'groups.g_moderator'])
			.where('users.id', '>', 1);
		query = 'id' in by ? query.where('users.id', '=', by.id) : query.where('users.username', '=', by.username);
		const row = await query.executeTakeFirst();
		return row !== undefined
			? { id: row.id, username: row.username, email: row.email, groupId: row.group_id, isModerator: row.g_moderator === 1 }
			: null;
	}

	async lastKnownIp(userId: number): Promise<string> {
		const post = await this.db
			.selectFrom('posts')
			.select('poster_ip')
			.where('poster_id', '=', userId)
			.orderBy('posted', 'desc')
			.limit(1)
			.executeTakeFirst();
		if (post?.poster_ip) return post.poster_ip;
		const user = await this.db.selectFrom('users').select('registration_ip').where('id', '=', userId).executeTakeFirst();
		return user?.registration_ip ?? '';
	}

	async countBans(criteria: BanSearchCriteria): Promise<number> {
		const row = await this.db
			.selectFrom('bans')
			.select((eb) => eb.fn.count<number>('bans.id').as('total'))
			.where(banFilter(criteria))
			.executeTakeFirstOrThrow();
		return Number(row.total);
	}

	async searchBans(criteria: BanSearchCriteria, offset: number, limit: number): Promise<BanListItem[]> {
		const rows = await this.db
			.selectFrom('bans')
			.where(banFilter(criteria))
			.leftJoin('users', 'users.id', 'bans.ban_creator')
			.select([
				'bans.id',
				'bans.username',
				'bans.ip',
				'bans.email',
				'bans.message',
				'bans.expire',
				'bans.ban_creator',
				'users.username as creator_name',
			])
			.orderBy(`bans.${criteria.orderBy}`, criteria.descending ? 'desc' : 'asc')
			.offset(offset)
			.limit(limit)
			.execute();
		return rows.map((row) => ({
			id: row.id,
			username: nullable(row.username),
			ip: nullable(row.ip),
			email: nullable(row.email),
			message: nullable(row.message),
			expire: row.expire,
			creator: row.creator_name !== null ? { id: row.ban_creator, username: row.creator_name } : null,
		}));
	}
}
