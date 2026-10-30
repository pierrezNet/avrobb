/**
 * Dialecte Kysely pour D1 : le SQL est celui de SQLite (adaptateur et compilateur de Kysely), seul
 * le pilote change. D1 refuse les transactions interactives (BEGIN/COMMIT) : une écriture en
 * plusieurs requêtes passe par un lot atomique (database.ts, `batch()`).
 */

import {
	type CompiledQuery,
	type DatabaseConnection,
	type Dialect,
	type Driver,
	type Kysely,
	type QueryResult,
	SqliteAdapter,
	SqliteIntrospector,
	SqliteQueryCompiler,
} from 'kysely';
import type { D1Database, D1PreparedStatement, D1Value } from './d1.ts';

/** Valeurs liées : D1 ne connaît ni les booléens ni undefined. */
function toD1Value(value: unknown): D1Value {
	if (value === undefined || value === null) return null;
	if (typeof value === 'boolean') return value ? 1 : 0;
	if (typeof value === 'bigint') return Number(value);
	if (typeof value === 'number' || typeof value === 'string' || value instanceof ArrayBuffer) return value;
	if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
	throw new TypeError(`Valeur non prise en charge par D1 : ${typeof value}`);
}

export function prepareCompiled(d1: D1Database, query: CompiledQuery): D1PreparedStatement {
	return d1.prepare(query.sql).bind(...query.parameters.map(toD1Value));
}

export function toQueryResult<R>(
	query: CompiledQuery,
	result: { results: unknown[]; meta: { changes: number; last_row_id: number } },
): QueryResult<R> {
	const kind = query.query.kind;
	const writes = kind === 'InsertQueryNode' || kind === 'UpdateQueryNode' || kind === 'DeleteQueryNode';
	return {
		rows: result.results as R[],
		...(writes ? { numAffectedRows: BigInt(result.meta.changes) } : {}),
		...(kind === 'InsertQueryNode' ? { insertId: BigInt(result.meta.last_row_id) } : {}),
	};
}

class D1Connection implements DatabaseConnection {
	constructor(private readonly d1: D1Database) {}

	async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
		return toQueryResult<R>(query, await prepareCompiled(this.d1, query).all());
	}

	// biome-ignore lint/correctness/useYield: D1 ne lit pas par flux ; on refuse avant tout résultat.
	async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
		throw new Error('D1 ne permet pas la lecture par flux');
	}
}

const NO_TRANSACTION = 'D1 ne permet pas les transactions interactives : utiliser batch() (src/db/database.ts)';

class D1Driver implements Driver {
	readonly #connection: D1Connection;

	constructor(d1: D1Database) {
		this.#connection = new D1Connection(d1);
	}

	async init(): Promise<void> {}
	async acquireConnection(): Promise<DatabaseConnection> {
		return this.#connection;
	}
	async beginTransaction(): Promise<void> {
		throw new Error(NO_TRANSACTION);
	}
	async commitTransaction(): Promise<void> {
		throw new Error(NO_TRANSACTION);
	}
	async rollbackTransaction(): Promise<void> {
		throw new Error(NO_TRANSACTION);
	}
	async releaseConnection(): Promise<void> {}
	async destroy(): Promise<void> {}
}

export class D1Dialect implements Dialect {
	constructor(private readonly d1: D1Database) {}

	createAdapter() {
		return new SqliteAdapter();
	}
	createDriver() {
		return new D1Driver(this.d1);
	}
	createQueryCompiler() {
		return new SqliteQueryCompiler();
	}
	createIntrospector(db: Kysely<unknown>) {
		return new SqliteIntrospector(db);
	}
}
