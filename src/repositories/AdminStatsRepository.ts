/**
 * Statistiques de l'administration (admin_statistics.php) : visiteurs actifs, nombre de lignes et
 * taille de la base.
 */

import type { Db } from '../db/database.ts';
import { TABLE_NAMES } from '../db/schema.ts';

export interface DatabaseInfo {
	version: string;
	rows: number;
	/** Taille de la base, en octets. */
	bytes: number;
}

export interface AdminStatsReader {
	/** Visiteurs non inactifs de la table online. */
	countActiveOnline(): Promise<number>;
	databaseInfo(): Promise<DatabaseInfo>;
}

export class AdminStatsRepository implements AdminStatsReader {
	constructor(private readonly db: Db) {}

	async countActiveOnline(): Promise<number> {
		const row = await this.db
			.selectFrom('online')
			.select((eb) => eb.fn.count<number>('user_id').as('total'))
			.where('idle', '=', 0)
			.executeTakeFirstOrThrow();
		return Number(row.total);
	}

	async databaseInfo(): Promise<DatabaseInfo> {
		// Une requête de comptage par table, envoyées ensemble (une seule aller-retour vers D1).
		const counts = await this.db.batch(
			TABLE_NAMES.map((table) => this.db.selectFrom(table).select((eb) => eb.fn.countAll<number>().as('n'))),
		);
		const rows = counts.reduce((sum, result) => sum + Number((result.rows[0] as { n: number } | undefined)?.n ?? 0), 0);
		return { version: 'Cloudflare D1 (SQLite)', rows, bytes: await this.db.databaseSize() };
	}
}
