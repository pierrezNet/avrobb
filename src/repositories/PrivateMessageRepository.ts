/**
 * Messagerie privée du mod APMS (table messages, propre à Pilote-Virtuel).
 */

import type { Db } from '../db/database.ts';

export interface PrivateMessageReader {
	/** MP non lus du membre (plugins/apms/header_add2.php). */
	countUnread(userId: number): Promise<number>;
}

export class PrivateMessageRepository implements PrivateMessageReader {
	constructor(private readonly db: Db) {}

	async countUnread(userId: number): Promise<number> {
		const row = await this.db
			.selectFrom('messages')
			.select((eb) => eb.fn.countAll<number>().as('unread'))
			.where('owner', '=', userId)
			.where('showed', '=', 0)
			.where('show_message', '=', 1)
			.executeTakeFirstOrThrow();

		return Number(row.unread);
	}
}
