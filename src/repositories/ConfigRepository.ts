/**
 * Lecture brute de la table config (clés o_* et p_*), source de vérité dont PHP tire cache_config.php.
 */

import type { Db } from '../db/database.ts';

export interface ConfigSource {
	loadValues(): Promise<Map<string, string>>;
}

export class ConfigRepository implements ConfigSource {
	constructor(private readonly db: Db) {}

	async loadValues(): Promise<Map<string, string>> {
		const rows = await this.db.selectFrom('config').select(['conf_name', 'conf_value']).execute();
		return new Map(rows.map((row) => [row.conf_name, row.conf_value ?? '']));
	}
}
