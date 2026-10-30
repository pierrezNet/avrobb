/**
 * Complètement des noms de membres (@mention, destinataires d'un message privé) : membres dont le nom
 * commence par le texte saisi.
 */

import type { Db } from '../db/database.ts';
import { escapeLike, likeEscaped } from './like.ts';

export interface MemberSuggestion {
	id: number;
	username: string;
}

export interface MemberSuggestReader {
	/** Membres inscrits (ni l'invité ni les comptes non validés) dont le nom commence par `prefix`. */
	suggestMembers(prefix: string, limit: number): Promise<MemberSuggestion[]>;
}

/** Échappe les jokers de LIKE (\, %, _) : le texte saisi est cherché tel quel. */
const likePrefix = (text: string): string => `${escapeLike(text)}%`;

export class MemberSuggestRepository implements MemberSuggestReader {
	constructor(private readonly db: Db) {}

	async suggestMembers(prefix: string, limit: number): Promise<MemberSuggestion[]> {
		const rows = await this.db
			.selectFrom('users')
			.select(['id', 'username'])
			.where('id', '>', 1)
			.where('group_id', '!=', 0)
			.where(likeEscaped('username', likePrefix(prefix)))
			.orderBy('username')
			.limit(limit)
			.execute();
		return rows.map((row) => ({ id: row.id, username: row.username }));
	}
}
