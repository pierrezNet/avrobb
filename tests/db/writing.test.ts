/**
 * Écritures partagées par la rédaction, sur une vraie base : index de recherche
 * (update_search_index(), strip_search_index()) et compteurs de forum (update_forum()).
 * Chaque test s'exécute dans une transaction annulée à la fin, pour laisser le jeu de données intact.
 */

import type { Kysely } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/db/database.ts';
import type { Database } from '../../src/db/schema.ts';
import { updateForum } from '../../src/repositories/forumCounters.ts';
import { stripSearchIndex, updateSearchIndex } from '../../src/repositories/searchIndexSql.ts';
import { testDbConfig } from './testDatabase.ts';

const db = createDatabase(testDbConfig());
afterAll(async () => db.destroy());

class Rollback extends Error {}

/** Exécute `body` dans une transaction toujours annulée. */
async function inRollback(body: (trx: Kysely<Database>) => Promise<void>): Promise<void> {
	await db
		.transaction()
		.execute(async (trx) => {
			await body(trx);
			throw new Rollback();
		})
		.catch((error: unknown) => {
			if (!(error instanceof Rollback)) throw error;
		});
}

async function indexOf(trx: Kysely<Database>, postId: number): Promise<string[]> {
	const rows = await trx
		.selectFrom('search_matches as m')
		.innerJoin('search_words as w', 'w.id', 'm.word_id')
		.select(['w.word', 'm.subject_match'])
		.where('m.post_id', '=', postId)
		.orderBy('w.word')
		.orderBy('m.subject_match')
		.execute();
	return rows.map((row) => `${row.word}${row.subject_match === 1 ? ' (sujet)' : ''}`);
}

const words = async (trx: Kysely<Database>): Promise<string[]> =>
	(await trx.selectFrom('search_words').select('word').orderBy('word').execute()).map((row) => row.word);

describe('index de recherche', () => {
	it('indexe un nouveau message en réutilisant les mots connus', async () => {
		await inRollback(async (trx) => {
			await updateSearchIndex(trx, 'post', 200, { post: ['avion', 'cockpit'], subject: ['avion'] });
			expect(await indexOf(trx, 200)).toEqual(['avion', 'avion (sujet)', 'cockpit']);
			expect(await words(trx)).toEqual(['avion', 'cockpit', 'interne', 'vintage']);
		});
	});

	it('ne réécrit que les différences à la modification', async () => {
		await inRollback(async (trx) => {
			await updateSearchIndex(trx, 'edit', 101, { post: ['avion', 'hélice'], subject: [] });
			expect(await indexOf(trx, 101)).toEqual(['avion', 'hélice']);
			// « vintage » reste connu : il sert encore au sujet du message 100.
			expect(await words(trx)).toContain('vintage');
		});
	});

	it('retire des messages et les mots qui ne servaient qu’à eux', async () => {
		await inRollback(async (trx) => {
			await stripSearchIndex(trx, [110]);
			expect(await indexOf(trx, 110)).toEqual([]);
			expect(await words(trx)).toEqual(['avion', 'vintage']);
		});
	});
});

describe('update_forum()', () => {
	it('recompte sujets et messages, dernier message hors sujets déplacés', async () => {
		await inRollback(async (trx) => {
			await updateForum(trx, 1);
			const forum = await trx
				.selectFrom('forums')
				.select(['num_topics', 'num_posts', 'last_post', 'last_post_id', 'last_poster'])
				.where('id', '=', 1)
				.executeTakeFirstOrThrow();
			// Sujets 12 (déplacé, 2 réponses) et 13 : le déplacé compte, mais n'est pas le dernier message.
			expect(forum).toEqual({ num_topics: 2, num_posts: 4, last_post: 1782700000, last_post_id: 0, last_poster: 'admin' });
		});
	});

	it('vide le dernier message d’un forum sans sujet', async () => {
		await inRollback(async (trx) => {
			await updateForum(trx, 4);
			const forum = await trx
				.selectFrom('forums')
				.select(['num_topics', 'num_posts', 'last_post'])
				.where('id', '=', 4)
				.executeTakeFirstOrThrow();
			expect(forum).toEqual({ num_topics: 0, num_posts: 0, last_post: null });
		});
	});
});
