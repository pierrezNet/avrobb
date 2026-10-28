/**
 * Lecture brute de la table config (clés o_* et p_*), source de vérité dont PHP tire cache_config.php,
 * et écriture des options modifiées dans l'administration.
 */

import type { Db } from '../db/database.ts';
import { inTransaction } from './transactions.ts';

export interface ConfigSource {
	loadValues(): Promise<Map<string, string>>;
}

export interface ConfigStore extends ConfigSource {
	/** Met à jour des clés existantes (null : NULL), comme la boucle UPDATE d'admin_options.php. */
	updateValues(changes: ReadonlyMap<string, string | null>): Promise<void>;
	/** REPLACE INTO config : crée ou remplace des clés (installation d'un mod). */
	replaceValues(values: ReadonlyMap<string, string>): Promise<void>;
	/** Supprime des clés (désinstallation d'un mod). */
	deleteValues(names: readonly string[]): Promise<void>;
}

export class ConfigRepository implements ConfigStore {
	constructor(private readonly db: Db) {}

	async loadValues(): Promise<Map<string, string>> {
		const rows = await this.db.selectFrom('config').select(['conf_name', 'conf_value']).execute();
		return new Map(rows.map((row) => [row.conf_name, row.conf_value ?? '']));
	}

	async updateValues(changes: ReadonlyMap<string, string | null>): Promise<void> {
		if (changes.size === 0) return;
		await inTransaction(this.db, async (trx) => {
			for (const [name, value] of changes) {
				await trx.updateTable('config').set({ conf_value: value }).where('conf_name', '=', name).execute();
			}
		});
	}

	async replaceValues(values: ReadonlyMap<string, string>): Promise<void> {
		await inTransaction(this.db, async (trx) => {
			for (const [name, value] of values)
				await trx.insertInto('config').values({ conf_name: name, conf_value: value }).onDuplicateKeyUpdate({ conf_value: value }).execute();
		});
	}

	async deleteValues(names: readonly string[]): Promise<void> {
		if (names.length > 0) await this.db.deleteFrom('config').where('conf_name', 'in', names).execute();
	}
}
