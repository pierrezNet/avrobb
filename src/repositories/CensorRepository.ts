/**
 * Mots censurés (table censoring), lus à chaque page qui en a besoin et seulement si o_censoring
 * est activé : la table est petite, et on évite ainsi d'avoir à suivre cache_censoring.php.
 * Modification dans l'administration (admin_censoring.php) : l'appelant supprime ensuite ce cache PHP.
 */

import type { Db } from '../db/database.ts';
import type { CensoredWord } from '../services/censor.ts';

export interface CensorReader {
	listWords(): Promise<CensoredWord[]>;
}

export interface CensorEntry extends CensoredWord {
	id: number;
}

export interface CensorStore extends CensorReader {
	listEntries(): Promise<CensorEntry[]>;
	addWord(word: CensoredWord): Promise<void>;
	updateWord(id: number, word: CensoredWord): Promise<void>;
	removeWord(id: number): Promise<void>;
}

export class CensorRepository implements CensorStore {
	constructor(private readonly db: Db) {}

	async listWords(): Promise<CensoredWord[]> {
		const rows = await this.db.selectFrom('censoring').select(['search_for', 'replace_with']).orderBy('id').execute();
		return rows.map((row) => ({ searchFor: row.search_for, replaceWith: row.replace_with }));
	}

	async listEntries(): Promise<CensorEntry[]> {
		const rows = await this.db.selectFrom('censoring').select(['id', 'search_for', 'replace_with']).orderBy('id').execute();
		return rows.map((row) => ({ id: row.id, searchFor: row.search_for, replaceWith: row.replace_with }));
	}

	async addWord(word: CensoredWord): Promise<void> {
		await this.db.insertInto('censoring').values({ search_for: word.searchFor, replace_with: word.replaceWith }).execute();
	}

	async updateWord(id: number, word: CensoredWord): Promise<void> {
		await this.db
			.updateTable('censoring')
			.set({ search_for: word.searchFor, replace_with: word.replaceWith })
			.where('id', '=', id)
			.execute();
	}

	async removeWord(id: number): Promise<void> {
		await this.db.deleteFrom('censoring').where('id', '=', id).execute();
	}
}
