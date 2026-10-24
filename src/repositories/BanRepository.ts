/**
 * Bannissements (table bans). Pour l'affichage, seuls les pseudos bannis servent : get_title()
 * donne le titre « En vacances » à leurs auteurs, que le bannissement soit expiré ou non (comme
 * $pun_bans, qui n'est purgé des bannissements expirés qu'au passage de check_bans()).
 */

import type { Db } from '../db/database.ts';

export interface BanReader {
	/** Pseudos bannis, en minuscules. */
	listBannedUsernames(): Promise<Set<string>>;
}

export class BanRepository implements BanReader {
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
}
