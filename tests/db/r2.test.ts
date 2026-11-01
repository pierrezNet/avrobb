/**
 * R2FileStore sur un vrai R2 local (Miniflare, par getPlatformProxy de Wrangler), dans un dossier
 * temporaire vidé à chaque lancement. Et FileReferenceRepository sur la base de test.
 */

import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { FileReferenceRepository } from '../../src/repositories/FileReferenceRepository.ts';
import { type R2BucketLike, R2FileStore } from '../../src/repositories/FileStore.ts';
import { closeTestDatabase, db } from './testDb.ts';

const R2_DIR = path.join(tmpdir(), 'avrobb-test-r2');
let dispose: (() => Promise<void>) | undefined;
let bucket: R2BucketLike;
let store: R2FileStore;

beforeAll(async () => {
	await rm(R2_DIR, { recursive: true, force: true });
	const proxy = await getPlatformProxy<{ FILES: R2BucketLike }>({
		configPath: path.join(import.meta.dirname, '..', '..', 'wrangler.jsonc'),
		persist: { path: R2_DIR },
		envFiles: [],
		// Pas de liaison distante (Workers AI) : inutile ici, et impossible sans session Cloudflare (CI).
		remoteBindings: false,
	});
	dispose = () => proxy.dispose();
	bucket = proxy.env.FILES;
	store = new R2FileStore(bucket);
});

afterAll(async () => {
	await dispose?.();
	await closeTestDatabase();
});

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('R2FileStore', () => {
	it('écrit, relit avec son type, liste par préfixe, efface', async () => {
		await store.put('img/gallery/1.webp', bytes('RIFF'), 'image/webp');
		await store.put('img/gallery/mini_1.webp', bytes('mini'), 'image/webp');
		await store.put('img/avatars/2.png', bytes('png'), 'image/png');

		const file = await store.get('img/gallery/1.webp');
		expect(file).toMatchObject({ key: 'img/gallery/1.webp', contentType: 'image/webp', size: 4 });
		expect(file?.etag).toMatch(/^".+"$/);
		expect(file?.uploadedAt).toBeGreaterThan(1_700_000_000);
		expect(await new Response(file?.body).text()).toBe('RIFF');
		expect((await store.head('img/avatars/2.png'))?.contentType).toBe('image/png');
		expect(await store.get('img/absent.png')).toBeNull();
		expect(await store.head('img/absent.png')).toBeNull();

		expect((await store.list('img/gallery/')).map((entry) => entry.key)).toEqual(['img/gallery/1.webp', 'img/gallery/mini_1.webp']);
		await store.delete(['img/gallery/1.webp', 'img/gallery/mini_1.webp', 'img/gallery/absent.webp']);
		expect(await store.list('img/gallery/')).toEqual([]);
		expect(await store.head('img/avatars/2.png')).not.toBeNull();
	});

	it('liste au-delà d’une page de résultats (curseur)', async () => {
		const keys = Array.from({ length: 5 }, (_, index) => `img/many/${index}.png`);
		for (const key of keys) await store.put(key, bytes('x'), 'image/png');
		const paged = new R2FileStore(bucket, 2);
		expect((await paged.list('img/many/')).map((entry) => entry.key)).toEqual(keys);
		await paged.delete(keys);
		expect(await store.list('img/many/')).toEqual([]);
	});
});

describe('FileReferenceRepository', () => {
	it('noms des images de la galerie et membres existants (par paquets de paramètres)', async () => {
		const references = new FileReferenceRepository(db);
		expect(await references.galleryFileNames()).toEqual(new Set(['1705145502.jpg', '1705159954.gif', '1705100000.php']));
		const ids = Array.from({ length: 250 }, (_, index) => index + 1);
		expect(await references.existingUserIds(ids)).toEqual(new Set([1, 2, 3, 5]));
		expect(await references.existingUserIds([])).toEqual(new Set());
	});
});
