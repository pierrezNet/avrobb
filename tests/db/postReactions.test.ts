/**
 * Réactions (PostReactionRepository) sur une vraie base : une réaction par membre, compteurs, derniers
 * noms, liste des membres, messages les plus appréciés lisibles par le groupe, purge de nuit.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { PostReactionRepository } from '../../src/repositories/PostReactionRepository.ts';
import { closeTestDatabase, inRollback } from './testDb.ts';

afterAll(closeTestDatabase);

describe('PostReactionRepository', () => {
	it('une réaction par membre, remplacée ou retirée ; compteurs, réaction du lecteur, derniers noms', async () => {
		await inRollback(async (trx) => {
			const store = new PostReactionRepository(trx);
			await store.save(100, 3, 'laugh', 10);
			await store.save(100, 5, 'laugh', 10);
			await store.save(100, 2, 'like', 12);
			// Nouvelle réaction : remplace la précédente.
			await store.save(100, 5, 'heart', 11);
			await store.save(101, 3, 'wow', 10);
			const found = await store.forPosts([100, 101, 102], 3);
			expect(found.get(100)).toEqual({ counts: { laugh: 1, heart: 1, like: 1 }, mine: 'laugh', reactors: 3, recent: ['admin', 'MaxDUO'] });
			expect(found.get(101)).toEqual({ counts: { wow: 1 }, mine: 'wow', reactors: 1, recent: [] });
			expect(found.has(102)).toBe(false);

			await store.save(100, 3, null, 13);
			expect((await store.forPosts([100], 1)).get(100)).toEqual({
				counts: { heart: 1, like: 1 },
				mine: null,
				reactors: 2,
				recent: ['admin', 'MaxDUO'],
			});
		});
	});

	it('liste des membres : du plus récent au plus ancien, filtre par réaction', async () => {
		await inRollback(async (trx) => {
			const store = new PostReactionRepository(trx);
			await store.save(100, 2, 'like', 10);
			await store.save(100, 3, 'sad', 30);
			await store.save(100, 5, 'sad', 20);
			expect(await store.listReactors(100, null, 0, 10)).toEqual([
				{ userId: 3, username: 'Tessy', reaction: 'sad', reactedAt: 30 },
				{ userId: 5, username: 'MaxDUO', reaction: 'sad', reactedAt: 20 },
				{ userId: 2, username: 'admin', reaction: 'like', reactedAt: 10 },
			]);
			expect((await store.listReactors(100, 'sad', 1, 10)).map((reactor) => reactor.userId)).toEqual([5]);
			expect((await store.listReactors(100, 'like', 0, 10)).map((reactor) => reactor.userId)).toEqual([2]);
		});
	});

	it('messages les plus appréciés de la semaine, dans les forums lisibles par le groupe', async () => {
		await inRollback(async (trx) => {
			const store = new PostReactionRepository(trx);
			await store.save(100, 3, 'heart', 1000);
			await store.save(100, 5, 'like', 1000);
			await store.save(101, 3, 'like', 1000);
			// Ancien : hors de la semaine.
			await store.save(102, 3, 'like', 10);
			// Message du forum Équipe (n° 3), illisible pour le groupe 3.
			await store.save(110, 3, 'party', 1000);
			const top = await store.listAppreciated(3, 900, 5);
			expect(top.map((post) => [post.postId, post.score])).toEqual([
				[100, 2],
				[101, 1],
			]);
			expect(top[0]).toMatchObject({ topicId: 10, poster: 'Tessy', message: 'Premier message [b]gras[/b]' });
			expect((await store.listAppreciated(4, 900, 5)).map((post) => post.postId)).toContain(110);
		});
	});

	it('purge de nuit : réactions des messages supprimés', async () => {
		await inRollback(async (trx) => {
			const store = new PostReactionRepository(trx);
			await store.save(100, 3, 'like', 10);
			await store.save(101, 3, 'like', 10);
			await trx.deleteFrom('posts').where('id', '=', 101).execute();
			await store.purgeOrphans();
			const left = await trx.selectFrom('post_reactions').select('post_id').execute();
			expect(left.map((row) => row.post_id)).toEqual([100]);
		});
	});
});
