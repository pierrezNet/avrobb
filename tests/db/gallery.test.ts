/**
 * Galerie sur une vraie base (GalleryRepository) : filtre par membre, ajout, lecture et
 * suppression. Transactions annulées.
 */

import type { Kysely } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/db/database.ts';
import type { Database } from '../../src/db/schema.ts';
import { GalleryRepository } from '../../src/repositories/GalleryRepository.ts';
import { testDbConfig } from './testDatabase.ts';

const db = createDatabase(testDbConfig());
afterAll(async () => db.destroy());

class Rollback extends Error {}

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
