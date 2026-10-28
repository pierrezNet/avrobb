/**
 * Plugin AP_Premium.php : membres promus dans un groupe pour une durée donnée (table premium, créée et
 * supprimée par le plugin), avec retour à leur groupe initial quand ils sont retirés.
 */

import { sql } from 'kysely';
import type { Db } from '../db/database.ts';
import { GroupId } from '../domain/models.ts';
import { inTransaction } from './transactions.ts';

export interface PremiumMember {
	id: number;
	username: string;
	email: string;
	groupTitle: string;
	endsAt: number;
}

export interface PremiumAdminStore {
	isInstalled(): Promise<boolean>;
	install(): Promise<void>;
	/** Rend leur groupe initial à tous les membres promus, puis supprime la table. */
	uninstall(): Promise<void>;
	listMembers(): Promise<PremiumMember[]>;
	/** Groupes proposés (tous sauf les invités). */
	listGroups(): Promise<{ id: number; title: string }[]>;
	/** Promeut le membre de cette adresse ; 'notFound' ou 'already' sinon. */
	addMember(email: string, groupId: number, start: number, end: number): Promise<'added' | 'notFound' | 'already'>;
	removeMembers(ids: readonly number[]): Promise<void>;
}

/** Table absente (ER_NO_SUCH_TABLE) : le plugin n'est pas installé. */
const isMissingTable = (error: unknown): boolean => error instanceof Error && 'code' in error && error.code === 'ER_NO_SUCH_TABLE';

export class PremiumAdminRepository implements PremiumAdminStore {
	constructor(private readonly db: Db) {}

	async isInstalled(): Promise<boolean> {
		try {
			await this.db.selectFrom('premium').select('id').limit(1).execute();
			return true;
		} catch (error) {
			if (isMissingTable(error)) return false;
			throw error;
		}
	}

	async install(): Promise<void> {
		// Structure du plugin (en InnoDB, comme les autres tables, au lieu de MyISAM).
		await sql`CREATE TABLE IF NOT EXISTS ${sql.table('premium')} (
			id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
			group_id_initial INT(10) UNSIGNED NOT NULL DEFAULT 4,
			group_id_premium INT(10) UNSIGNED NOT NULL DEFAULT 4,
			username VARCHAR(200) NOT NULL DEFAULT '',
			email VARCHAR(50) NOT NULL DEFAULT '',
			start_premium INT(10) UNSIGNED NOT NULL DEFAULT 0,
			end_premium INT(10) UNSIGNED NOT NULL DEFAULT 0,
			PRIMARY KEY (id)
		) ENGINE=InnoDB`.execute(this.db);
	}

	async uninstall(): Promise<void> {
		const members = await this.db.selectFrom('premium').select('id').execute();
		await this.removeMembers(members.map((member) => member.id));
		await sql`DROP TABLE ${sql.table('premium')}`.execute(this.db);
	}

	async listMembers(): Promise<PremiumMember[]> {
		const rows = await this.db
			.selectFrom('premium as p')
			.leftJoin('groups as g', 'g.g_id', 'p.group_id_premium')
			.select(['p.id', 'p.username', 'p.email', 'p.end_premium', 'g.g_title'])
			.orderBy('p.username')
			.execute();
		return rows.map((row) => ({
			id: row.id,
			username: row.username,
			email: row.email,
			groupTitle: row.g_title ?? '',
			endsAt: row.end_premium,
		}));
	}

	async listGroups(): Promise<{ id: number; title: string }[]> {
		const rows = await this.db
			.selectFrom('groups')
			.select(['g_id', 'g_title'])
			.where('g_id', '!=', GroupId.Guest)
			.orderBy('g_id')
			.execute();
		return rows.map((row) => ({ id: row.g_id, title: row.g_title }));
	}

	addMember(email: string, groupId: number, start: number, end: number): Promise<'added' | 'notFound' | 'already'> {
		return inTransaction(this.db, async (trx) => {
			const user = await trx.selectFrom('users').select(['id', 'group_id', 'username']).where('email', '=', email).executeTakeFirst();
			if (user === undefined) return 'notFound';
			const existing = await trx.selectFrom('premium').select('id').where('email', '=', email).executeTakeFirst();
			if (existing !== undefined) return 'already';
			await trx
				.insertInto('premium')
				.values({
					id: user.id,
					group_id_initial: user.group_id,
					group_id_premium: groupId,
					username: user.username,
					email,
					start_premium: start,
					end_premium: end,
				})
				.execute();
			await trx.updateTable('users').set({ group_id: groupId }).where('id', '=', user.id).execute();
			return 'added';
		});
	}

	async removeMembers(ids: readonly number[]): Promise<void> {
		if (ids.length === 0) return;
		await inTransaction(this.db, async (trx) => {
			const members = await trx.selectFrom('premium').select(['id', 'group_id_initial']).where('id', 'in', ids).execute();
			for (const member of members) {
				await trx.updateTable('users').set({ group_id: member.group_id_initial }).where('id', '=', member.id).execute();
				await trx.deleteFrom('premium').where('id', '=', member.id).execute();
			}
		});
	}
}
