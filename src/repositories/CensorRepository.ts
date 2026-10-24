/**
 * Mots censurés (table censoring), lus à chaque page qui en a besoin et seulement si o_censoring
 * est activé : la table est petite, et on évite ainsi d'avoir à suivre cache_censoring.php.
 */

import type { Db } from '../db/database.ts';
import type { CensoredWord } from '../services/censor.ts';

export interface CensorReader {
	listWords(): Promise<CensoredWord[]>;
}

export class CensorRepository implements CensorReader {
	constructor(private readonly db: Db) {}

	async listWords(): Promise<CensoredWord[]> {
		const rows = await this.db.selectFrom('censoring').select(['search_for', 'replace_with']).orderBy('id').execute();
		return rows.map((row) => ({ searchFor: row.search_for, replaceWith: row.replace_with }));
	}
}
