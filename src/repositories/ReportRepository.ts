/**
 * Signalements de messages (table reports).
 */

import type { Db } from '../db/database.ts';

export interface ReportReader {
	/** Reste-t-il des signalements non traités ? (lien « nouveaux signalements » de header.php) */
	hasPending(): Promise<boolean>;
}

export class ReportRepository implements ReportReader {
	constructor(private readonly db: Db) {}

	async hasPending(): Promise<boolean> {
		const row = await this.db.selectFrom('reports').select('id').where('zapped', 'is', null).limit(1).executeTakeFirst();
		return row !== undefined;
	}
}
