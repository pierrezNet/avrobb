/**
 * Sous-ensemble de l'API D1 de Cloudflare utilisé par le forum, déclaré ici plutôt que tiré de
 * @cloudflare/workers-types (dont les types globaux entreraient en conflit avec ceux de Node).
 */

export type D1Value = string | number | null | ArrayBuffer;

export interface D1Result<T = Record<string, unknown>> {
	results: T[];
	/** size_after : taille de la base après la requête, en octets. */
	meta: { changes: number; last_row_id: number; size_after?: number };
}

export interface D1PreparedStatement {
	bind(...values: D1Value[]): D1PreparedStatement;
	all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
	prepare(sql: string): D1PreparedStatement;
	/** Exécute les instructions dans l'ordre, en une seule transaction : tout ou rien. */
	batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
	/** Plusieurs instructions SQL séparées par des « ; » (migrations, jeux de données). */
	exec(sql: string): Promise<unknown>;
}
