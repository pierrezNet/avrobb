/**
 * Préfixes du sujet (PV) : nouveau sujet d'une discussion, avec ses liens de redirection et l'index
 * de recherche de son premier message, comme edit.php quand il change le sujet.
 */

import type { Db } from '../db/database.ts';
import type { IndexedWords } from '../services/searchIndex.ts';
import { updateSearchIndex } from './searchIndexSql.ts';
import { inTransaction } from './transactions.ts';

export interface SubjectPrefixStore {
	/** Texte du premier message (pour réindexer le sujet avec lui). */
	firstPostMessage(postId: number): Promise<string>;
	updateSubject(topicId: number, firstPostId: number, subject: string, words: IndexedWords): Promise<void>;
}

export class SubjectPrefixRepository implements SubjectPrefixStore {
	constructor(private readonly db: Db) {}

	async firstPostMessage(postId: number): Promise<string> {
		const row = await this.db.selectFrom('posts').select('message').where('id', '=', postId).executeTakeFirst();
		return row?.message ?? '';
	}

	async updateSubject(topicId: number, firstPostId: number, subject: string, words: IndexedWords): Promise<void> {
		await inTransaction(this.db, async (trx) => {
			// Le sujet et ses liens laissés par un déplacement (moved_to) changent ensemble.
			await trx
				.updateTable('topics')
				.set({ subject })
				.where((eb) => eb.or([eb('id', '=', topicId), eb('moved_to', '=', topicId)]))
				.execute();
			await updateSearchIndex(trx, 'edit', firstPostId, words);
		});
	}
}
