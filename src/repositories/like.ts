/**
 * Recherche d'un texte littéral avec LIKE. SQLite n'a pas de caractère d'échappement par défaut
 * (MySQL utilise « \ ») : la clause ESCAPE est donc écrite explicitement.
 */

import { type RawBuilder, type SqlBool, sql } from 'kysely';

/** Texte dont %, _ et \ ne sont plus des jokers (à utiliser avec likeEscaped()). */
export function escapeLike(text: string): string {
	return text.replace(/[\\%_]/g, '\\$&');
}

/** `colonne LIKE motif ESCAPE '\'` ; `column` est un nom de colonne écrit dans le code, jamais une saisie. */
export function likeEscaped(column: string, pattern: string): RawBuilder<SqlBool> {
	return sql<SqlBool>`${sql.ref(column)} LIKE ${pattern} ESCAPE '\\'`;
}
