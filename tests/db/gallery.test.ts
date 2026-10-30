/**
 * Galerie sur une vraie base (GalleryRepository) : filtre par membre, ajout, lecture et
 * suppression. Transactions annulées.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { GalleryRepository } from '../../src/repositories/GalleryRepository.ts';
import { closeTestDatabase, inRollback } from './testDb.ts';

afterAll(closeTestDatabase);

describe('GalleryRepository', () => {
	it('une image WebP (conversion à l’envoi) est listée et retrouvée', async () => {
		await inRollback(async (trx) => {
			const gallery = new GalleryRepository(trx);
			const id = await gallery.createImage({
				title: 'Peinture',
				description: 'Livrée',
				userId: 3,
				addedAt: 1_793_184_348,
				extension: '.webp',
			});
			expect((await gallery.listImages(0, 50, 3)).map((image) => image.id)).toContain(id);
			expect(await gallery.findImage(id)).toMatchObject({ id, extension: '.webp' });
		});
	});

	it('cherche dans le titre et la description, sans jokers', async () => {
		await inRollback(async (trx) => {
			const gallery = new GalleryRepository(trx);
			const id = await gallery.createImage({
				title: 'Concorde',
				description: 'Approche 100% manuelle',
				userId: 3,
				addedAt: 1_793_184_400,
				extension: '.webp',
			});
			expect((await gallery.listImages(0, 50, 3, 'concorde')).map((image) => image.id)).toContain(id);
			expect((await gallery.listImages(0, 50, 3, '100% man')).map((image) => image.id)).toContain(id);
			expect((await gallery.listImages(0, 50, 3, 'Appro_he')).map((image) => image.id)).not.toContain(id);
			expect(await gallery.listImages(0, 50, 999, 'concorde')).toEqual([]);
		});
	});

	it('ajoute, filtre par membre, retrouve et supprime une image', async () => {
		await inRollback(async (trx) => {
			const gallery = new GalleryRepository(trx);
			const before = await gallery.countImages();
			const id = await gallery.createImage({
				title: 'Vol',
				description: 'Au [b]soleil[/b]',
				userId: 3,
				addedAt: 1_782_900_000,
				extension: '.png',
			});

			expect(await gallery.countImages()).toBe(before + 1);
			expect(await gallery.countImages(3)).toBeGreaterThanOrEqual(1);
			expect(await gallery.countImages(999)).toBe(0);
			expect((await gallery.listImages(0, 50, 3)).every((image) => image.userId === 3)).toBe(true);
			expect(await gallery.findImage(id)).toEqual({
				id,
				title: 'Vol',
				userId: 3,
				username: 'Tessy',
				description: 'Au [b]soleil[/b]',
				addedAt: 1_782_900_000,
				extension: '.png',
			});

			await gallery.deleteImage(id);
			expect(await gallery.findImage(id)).toBeNull();
		});
	});
});
