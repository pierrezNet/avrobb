/**
 * Base du forum : Kysely sur D1 (SQLite), avec `batch()` pour les écritures en plusieurs requêtes.
 *
 * D1 n'a pas de transaction interactive. Une écriture qui touche plusieurs tables (message, sujet,
 * forum, compteurs, index) se prépare donc en deux temps : les lectures d'abord, puis toutes les
 * écritures envoyées ensemble par `db.batch([...])`, exécutées dans l'ordre et en une seule
 * transaction (tout ou rien). Les compteurs s'y mettent à jour de façon relative (`x = x + 1`).
 */

import { type CompiledQuery, Kysely, type QueryResult, type RawBuilder } from 'kysely';
import type { D1Database } from './d1.ts';
import { D1Dialect, prepareCompiled, toQueryResult } from './d1Dialect.ts';
import type { Database } from './schema.ts';

/** Requête Kysely prête à compiler (insertInto(…), updateTable(…)…, sans execute()). */
export interface Compilable {
	compile(): CompiledQuery;
}

export interface Db extends Kysely<Database> {
	/** Exécute les requêtes dans l'ordre, atomiquement ; un tableau vide ne fait rien. */
	batch(queries: readonly Compilable[]): Promise<QueryResult<unknown>[]>;
	/** Taille de la base en octets (métadonnée de D1 : PRAGMA page_count y est refusé). */
	databaseSize(): Promise<number>;
}

/** Première ligne du dernier résultat d'un lot : le SELECT final qui relit les identifiants créés. */
export function lastRow<T>(results: readonly QueryResult<unknown>[]): T {
	const row = results.at(-1)?.rows[0];
	if (row === undefined) throw new Error('Lot sans résultat final');
	return row as T;
}

/** Requête SQL brute (`sql\`…\``) à placer dans un lot. */
export function rawQuery(db: Kysely<Database>, query: RawBuilder<unknown>): Compilable {
	return { compile: () => query.compile(db) };
}

export function createDatabase(d1: D1Database): Db {
	const kysely = new Kysely<Database>({ dialect: new D1Dialect(d1) });
	const batch = async (queries: readonly Compilable[]): Promise<QueryResult<unknown>[]> => {
		if (queries.length === 0) return [];
		const compiled = queries.map((query) => query.compile());
		const results = await d1.batch(compiled.map((query) => prepareCompiled(d1, query)));
		return results.map((result, index) => toQueryResult(compiled[index] as CompiledQuery, result));
	};
	const databaseSize = async (): Promise<number> => (await d1.prepare('SELECT 1').all()).meta.size_after ?? 0;
	return Object.assign(kysely, { batch, databaseSize });
}
