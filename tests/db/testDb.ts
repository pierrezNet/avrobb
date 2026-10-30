/**
 * Base partagée par un fichier de tests d'intégration. D1 n'a pas de transaction à annuler :
 * `inRollback()` exécute le test puis remet la base dans son état de départ (tables vidées, jeu de
 * données rechargé). Les fichiers s'exécutent l'un après l'autre (vitest.db.config.ts).
 */

import { sql } from 'kysely';
import { createDatabase, type Db } from '../../src/db/database.ts';
import { TABLE_NAMES } from '../../src/db/schema.ts';
import { openTestD1, runSqlScript, seedScript } from './testDatabase.ts';

const testD1 = await openTestD1();
export const db: Db = createDatabase(testD1.d1);

/** Tables vidées (numérotation comprise) puis jeu de données rechargé. */
export async function resetDatabase(): Promise<void> {
	await db.batch([...TABLE_NAMES.map((table) => db.deleteFrom(table)), { compile: () => sql`DELETE FROM sqlite_sequence`.compile(db) }]);
	await runSqlScript(testD1.d1, seedScript());
}

/** Exécute le test, puis remet la base dans son état de départ, même en cas d'échec. */
export async function inRollback(body: (db: Db) => Promise<void>): Promise<void> {
	try {
		await body(db);
	} finally {
		await resetDatabase();
	}
}

export const closeTestDatabase = (): Promise<void> => testD1.dispose();
