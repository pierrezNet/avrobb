/**
 * Statistiques de l'administration (admin_statistics.php) : visiteurs actifs, version et taille de
 * la base (tables du forum seulement, comme SHOW TABLE STATUS LIKE '<préfixe>%').
 */

import { sql } from 'kysely';
import type { Db } from '../db/database.ts';

export interface DatabaseInfo {
	version: string;
	rows: number;
	/** Données et index, en octets. */
	bytes: number;
}

export interface AdminStatsReader {
	/** Visiteurs non inactifs de la table online. */
	countActiveOnline(): Promise<number>;
	databaseInfo(): Promise<DatabaseInfo>;
}

export class AdminStatsRepository implements AdminStatsReader {
	constructor(
		private readonly db: Db,
		private readonly prefix: string,
	) {}

	async countActiveOnline(): Promise<number> {
		const row = await this.db
			.selectFrom('online')
			.select((eb) => eb.fn.count<number>('user_id').as('total'))
			.where('idle', '=', 0)
			.executeTakeFirstOrThrow();
		return Number(row.total);
	}

	async databaseInfo(): Promise<DatabaseInfo> {
		const version = await sql<{ version: string }>`SELECT VERSION() AS version`.execute(this.db);
		// Préfixe tiré de la configuration du serveur, jamais d'une entrée utilisateur ; « _ » échappé pour LIKE.
		const pattern = `${this.prefix.replace(/[\\%_]/g, '\\$&')}%`;
		const status = await sql<{
			Rows: number | null;
			Data_length: number | null;
			Index_length: number | null;
		}>`SHOW TABLE STATUS LIKE ${pattern}`.execute(this.db);
		let rows = 0;
		let bytes = 0;
		for (const table of status.rows) {
			rows += Number(table.Rows ?? 0);
			bytes += Number(table.Data_length ?? 0) + Number(table.Index_length ?? 0);
		}
		return { version: version.rows[0]?.version ?? '', rows, bytes };
	}
}
