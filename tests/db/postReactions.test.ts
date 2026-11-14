/**
 * « J'aime » et réactions (PostReactionRepository) sur une vraie base : un « J'aime » et une réaction
 * par membre, compteurs, messages les plus appréciés lisibles par le groupe.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { PostReactionRepository } from '../../src/repositories/PostReactionRepository.ts';
import { closeTestDatabase, inRollback } from './testDb.ts';

afterAll(closeTestDatabase);

describe('PostReactionRepository', () => {
	it('un « J’aime » et une réaction par membre ; compteurs et choix du lecteur', async () => {
		await inRollback(async (trx) => {
			const store = new PostReactionRepository(trx);
			await store.save(100, 3, { liked: true, reaction: 'laugh' }, 10);
			await store.save(100, 5, { liked: true, reaction: 'laugh' }, 10);
			// Nouvelle réaction : remplace la précédente.
			await store.save(100, 5, { liked: true, reaction: 'heart' }, 11);
			await store.save(101, 3, { liked: false, reaction: 'wow' }, 10);
			const counts = await store.forPosts([100, 101, 102], 3);
			expect(counts.get(100)).toEqual({ likes: 2, reactions: { laugh: 1, heart: 1 }, liked: true, reaction: 'laugh' });
			expect(counts.get(101)).toEqual({ likes: 0, reactions: { wow: 1 }, liked: false, reaction: 'wow' });
			expect(counts.has(102)).toBe(false);
			// Vu par un autre membre : ses propres choix.
			expect((await store.forPosts([100], 5)).get(100)).toMatchObject({ liked: true, reaction: 'heart' });

			await store.save(100, 3, { liked: false, reaction: null }, 12);
			expect((await store.forPosts([100], 3)).get(100)).toEqual({ likes: 1, reactions: { heart: 1 }, liked: false, reaction: null });
		});
	});

	it('messages les plus appréciés de la semaine, dans les forums lisibles par le groupe', async () => {
		await inRollback(async (trx) => {
			const store = new PostReactionRepository(trx);
			await store.save(100, 3, { liked: true, reaction: 'heart' }, 1000);
			await store.save(100, 5, { liked: true, reaction: null }, 1000);
			await store.save(101, 3, { liked: true, reaction: null }, 1000);
			// Ancien : hors de la semaine.
			await store.save(102, 3, { liked: true, reaction: null }, 10);
			// Message du forum Équipe (n° 3), illisible pour le groupe 3.
			await store.save(110, 3, { liked: true, reaction: 'party' }, 1000);
			const top = await store.listAppreciated(3, 900, 5);
			expect(top.map((post) => [post.postId, post.score])).toEqual([
				[100, 3],
				[101, 1],
			]);
			expect(top[0]).toMatchObject({ topicId: 10, poster: 'Tessy', message: 'Premier message [b]gras[/b]' });
			expect((await store.listAppreciated(4, 900, 5)).map((post) => post.postId)).toContain(110);
		});
	});

	it('purge de nuit : réactions des messages supprimés', async () => {
		await inRollback(async (trx) => {
			const store = new PostReactionRepository(trx);
			await store.save(100, 3, { liked: true, reaction: null }, 10);
			await store.save(101, 3, { liked: true, reaction: null }, 10);
			await trx.deleteFrom('posts').where('id', '=', 101).execute();
			await store.purgeOrphans();
			const left = await trx.selectFrom('post_reactions').select('post_id').execute();
			expect(left.map((row) => row.post_id)).toEqual([100]);
		});
	});
});
