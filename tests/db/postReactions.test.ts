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
			expect(counts.get(100)).toEqual({
				likes: 2,
				reactions: { laugh: 1, heart: 1 },
				liked: true,
				reaction: 'laugh',
				reactors: 2,
				recent: ['MaxDUO'],
			});
			expect(counts.get(101)).toEqual({ likes: 0, reactions: { wow: 1 }, liked: false, reaction: 'wow', reactors: 1, recent: [] });
			expect(counts.has(102)).toBe(false);
			// Vu par un autre membre : ses propres choix.
			expect((await store.forPosts([100], 5)).get(100)).toMatchObject({ liked: true, reaction: 'heart' });

			await store.save(100, 3, { liked: false, reaction: null }, 12);
			expect((await store.forPosts([100], 3)).get(100)).toMatchObject({
				likes: 1,
				reactions: { heart: 1 },
				liked: false,
				reaction: null,
				reactors: 1,
			});
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

	it('liste des membres : une ligne chacun, du plus récent au plus ancien, filtre ; derniers noms', async () => {
		await inRollback(async (trx) => {
			const store = new PostReactionRepository(trx);
			await store.save(100, 2, { liked: true, reaction: null }, 10);
			await store.save(100, 3, { liked: true, reaction: 'sad' }, 30);
			await store.save(100, 5, { liked: false, reaction: 'sad' }, 20);
			expect(await store.listReactors(100, null, 0, 10)).toEqual([
				{ userId: 3, username: 'Tessy', liked: true, reaction: 'sad', reactedAt: 30 },
				{ userId: 5, username: 'MaxDUO', liked: false, reaction: 'sad', reactedAt: 20 },
				{ userId: 2, username: 'admin', liked: true, reaction: null, reactedAt: 10 },
			]);
			expect((await store.listReactors(100, { kind: 'like' }, 0, 10)).map((r) => r.userId)).toEqual([3, 2]);
			expect((await store.listReactors(100, { kind: 'emoji', reaction: 'sad' }, 1, 10)).map((r) => r.userId)).toEqual([5]);
			expect((await store.forPosts([100], 1)).get(100)?.recent).toEqual(['Tessy', 'MaxDUO', 'admin']);
			expect((await store.forPosts([100], 5)).get(100)?.recent).toEqual(['Tessy', 'admin']);
		});
	});
});
