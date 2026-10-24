/**
 * Écritures de l'index de recherche (include/search_idx.php) : update_search_index() et
 * strip_search_index(). Fonctions appelées dans la transaction de l'écriture du message, pour que
 * message et index restent cohérents ; les mots viennent de services/searchIndex.ts.
 */

import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.ts';
import { type CurrentIndex, type IndexedWords, newWords, planIndexUpdate } from '../services/searchIndex.ts';

/** Index actuel d'un message (mode « edit » de update_search_index()). */
async function currentIndex(db: Kysely<Database>, postId: number): Promise<CurrentIndex> {
	const rows = await db
		.selectFrom('search_words as w')
		.innerJoin('search_matches as m', 'w.id', 'm.word_id')
		.select(['w.id', 'w.word', 'm.subject_match'])
		.where('m.post_id', '=', postId)
		.execute();
	const post = new Map<string, number>();
	const subject = new Map<string, number>();
	for (const row of rows) (row.subject_match === 1 ? subject : post).set(row.word, row.id);
	return { post, subject };
}

/**
 * update_search_index() : `post` pour un nouveau message (index vide), `edit` pour une modification
 * (seules les différences sont écrites).
 */
export async function updateSearchIndex(db: Kysely<Database>, mode: 'post' | 'edit', postId: number, words: IndexedWords): Promise<void> {
	const changes = planIndexUpdate(words, mode === 'edit' ? await currentIndex(db, postId) : { post: new Map(), subject: new Map() });

	const wanted = [...new Set([...changes.add.post, ...changes.add.subject])];
	if (wanted.length > 0) {
		const known = await db.selectFrom('search_words').select('word').where('word', 'in', wanted).execute();
		const fresh = newWords(changes, new Set(known.map((row) => row.word)));
		// IGNORE : un mot créé entre-temps par une autre écriture (le PHP ignorait aussi l'erreur).
		if (fresh.length > 0)
			await db
				.insertInto('search_words')
				.ignore()
				.values(fresh.map((word) => ({ word })))
				.execute();
	}

	for (const [subjectMatch, wordIds] of [
		[0, changes.remove.post],
		[1, changes.remove.subject],
	] as const) {
		if (wordIds.length > 0)
			await db
				.deleteFrom('search_matches')
				.where('word_id', 'in', wordIds)
				.where('post_id', '=', postId)
				.where('subject_match', '=', subjectMatch)
				.execute();
	}

	for (const [subjectMatch, list] of [
		[0, changes.add.post],
		[1, changes.add.subject],
	] as const) {
		if (list.length > 0)
			await db
				.insertInto('search_matches')
				.columns(['post_id', 'word_id', 'subject_match'])
				.expression((eb) =>
					eb
						.selectFrom('search_words')
						.select([eb.val(postId).as('post_id'), 'id', eb.val(subjectMatch).as('subject_match')])
						.where('word', 'in', list),
				)
				.execute();
	}
}

/** strip_search_index() : retire les messages de l'index, et les mots qui n'étaient utilisés qu'une fois. */
export async function stripSearchIndex(db: Kysely<Database>, postIds: readonly number[]): Promise<void> {
	if (postIds.length === 0) return;

	const used = await db.selectFrom('search_matches').select('word_id').where('post_id', 'in', postIds).groupBy('word_id').execute();
	if (used.length > 0) {
		// Fidèle au PHP : un mot présent deux fois (texte et sujet) dans ces messages compte 2 et reste.
		const single = await db
			.selectFrom('search_matches')
			.select('word_id')
			.where(
				'word_id',
				'in',
				used.map((row) => row.word_id),
			)
			.groupBy('word_id')
			.having((eb) => eb.fn.count('word_id'), '=', 1)
			.execute();
		if (single.length > 0)
			await db
				.deleteFrom('search_words')
				.where(
					'id',
					'in',
					single.map((row) => row.word_id),
				)
				.execute();
	}

	await db.deleteFrom('search_matches').where('post_id', 'in', postIds).execute();
}
