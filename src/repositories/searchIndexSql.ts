/**
 * Écritures de l'index de recherche (include/search_idx.php) : update_search_index() et
 * strip_search_index(). Les lectures sont faites ici ; les écritures sont **renvoyées**, pour que
 * l'appelant les place dans le même lot atomique que l'écriture du message (database.ts, batch()).
 * Les mots viennent de services/searchIndex.ts.
 */

import { type RawBuilder, sql } from 'kysely';
import type { Compilable, Db } from '../db/database.ts';
import { type CurrentIndex, type IndexedWords, planIndexUpdate } from '../services/searchIndex.ts';

/** Identifiant du dernier message créé dans le lot en cours (AUTOINCREMENT : toujours le plus grand). */
export const LAST_POST_ID = sql<number>`(SELECT MAX(id) FROM posts)`;
/** Identifiant de la dernière discussion créée dans le lot en cours. */
export const LAST_TOPIC_ID = sql<number>`(SELECT MAX(id) FROM topics)`;

/** Index actuel d'un message (mode « edit » de update_search_index()). */
async function currentIndex(db: Db, postId: number): Promise<CurrentIndex> {
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
 * update_search_index() : `post` pour un nouveau message (index vide ; `postId` peut alors être
 * LAST_POST_ID), `edit` pour une modification (seules les différences sont écrites).
 */
export async function searchIndexWrites(
	db: Db,
	mode: 'post' | 'edit',
	postId: number | RawBuilder<number>,
	words: IndexedWords,
): Promise<Compilable[]> {
	const current = mode === 'edit' && typeof postId === 'number' ? await currentIndex(db, postId) : { post: new Map(), subject: new Map() };
	const changes = planIndexUpdate(words, current);
	const postIdValue = typeof postId === 'number' ? sql<number>`${postId}` : postId;
	const writes: Compilable[] = [];

	// OR IGNORE : un mot déjà connu, ou créé entre-temps par une autre écriture, est laissé tel quel.
	const wanted = [...new Set([...changes.add.post, ...changes.add.subject])];
	if (wanted.length > 0)
		writes.push(
			db
				.insertInto('search_words')
				.orIgnore()
				.values(wanted.map((word) => ({ word }))),
		);

	for (const [subjectMatch, wordIds] of [
		[0, changes.remove.post],
		[1, changes.remove.subject],
	] as const) {
		if (wordIds.length > 0 && typeof postId === 'number')
			writes.push(
				db
					.deleteFrom('search_matches')
					.where('word_id', 'in', wordIds)
					.where('post_id', '=', postId)
					.where('subject_match', '=', subjectMatch),
			);
	}

	for (const [subjectMatch, list] of [
		[0, changes.add.post],
		[1, changes.add.subject],
	] as const) {
		if (list.length > 0)
			writes.push(
				db
					.insertInto('search_matches')
					.columns(['post_id', 'word_id', 'subject_match'])
					.expression((eb) =>
						eb
							.selectFrom('search_words')
							.select([postIdValue.as('post_id'), 'id', eb.val(subjectMatch).as('subject_match')])
							.where('word', 'in', list),
					),
			);
	}
	return writes;
}

/** strip_search_index() : retire les messages de l'index, et les mots qui n'étaient utilisés qu'une fois. */
export async function stripSearchIndexWrites(db: Db, postIds: readonly number[]): Promise<Compilable[]> {
	if (postIds.length === 0) return [];
	const writes: Compilable[] = [];

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
			writes.push(
				db.deleteFrom('search_words').where(
					'id',
					'in',
					single.map((row) => row.word_id),
				),
			);
	}

	writes.push(db.deleteFrom('search_matches').where('post_id', 'in', postIds));
	return writes;
}
