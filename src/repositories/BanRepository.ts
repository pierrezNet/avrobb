/**
 * Bannissements (table bans). Pour l'affichage, seuls les pseudos bannis servent : get_title()
 * donne le titre « En vacances » à leurs auteurs, que le bannissement soit expiré ou non (comme
 * $pun_bans, qui n'est purgé des bannissements expirés qu'au passage de check_bans()).
 */

import type { Db } from '../db/database.ts';
import type { Ban } from '../services/bans.ts';

export interface BanReader {
	/** Pseudos bannis, en minuscules. */
	listBannedUsernames(): Promise<Set<string>>;
	/** Tous les bannissements, dans l'ordre de la table ($pun_bans). */
	listBans(): Promise<Ban[]>;
}

export interface BanWriter {
	/** Supprime des bannissements échus (check_bans()) ; l'appelant invalide cache_bans.php. */
	deleteBans(ids: readonly number[]): Promise<void>;
}

export class BanRepository implements BanReader, BanWriter {
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
}
