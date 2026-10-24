/**
 * Transactions des repositories : une écriture en plusieurs requêtes ouvre sa transaction, ou
 * rejoint celle de l'appelant (les tests sur base réelle l'ouvrent puis l'annulent).
 */

import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.ts';

export function inTransaction<T>(db: Kysely<Database>, body: (trx: Kysely<Database>) => Promise<T>): Promise<T> {
	return db.isTransaction ? body(db) : db.transaction().execute(body);
}
