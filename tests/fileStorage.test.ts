/**
 * Fichiers envoyés dans R2 (doublure en mémoire) : avatars, galerie, nettoyage des orphelins par la
 * tâche planifiée, cache en bordure de /img/.
 */

import { describe, expect, it } from 'vitest';
import { ScheduledTasks } from '../src/controllers/ScheduledTasks.ts';
import { EDGE_TTL, type EdgeCache, isEdgeCacheable, PAGE_CACHE_CONTROL, PAGE_TTL, withEdgeCache } from '../src/http/edgeCache.ts';
import { AvatarFiles, avatarsDirectory } from '../src/repositories/AvatarFiles.ts';
import { GalleryFiles } from '../src/repositories/GalleryFiles.ts';
import { ORPHAN_MIN_AGE, orphanAvatarKeys, orphanGalleryKeys } from '../src/services/fileCleanup.ts';
import { boardConfig } from './fixtures.ts';
import { MemoryFileStore } from './memoryFileStore.ts';

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('AvatarFiles', () => {
	it('adresse avec la date du fichier ; un envoi remplace l’avatar d’une autre extension', async () => {
		let now = 1000;
		const store = new MemoryFileStore(() => now);
		const avatars = new AvatarFiles(store, () => now);
		expect(await avatars.urlFor(3, 'img/avatars')).toBeNull();

		await avatars.save(3, 'img/avatars/', 'png', bytes('png'));
		expect(await avatars.urlFor(3, 'img/avatars')).toBe('/img/avatars/3.png?m=1000');
		expect((await store.head('img/avatars/3.png'))?.contentType).toBe('image/png');

		now = 2000;
		await avatars.save(3, 'img/avatars', 'webp', bytes('webp'));
		expect([...store.entries.keys()]).toEqual(['img/avatars/3.webp']);
		expect(await avatars.urlFor(3, 'img/avatars')).toBe('/img/avatars/3.webp?m=2000');

		await avatars.delete(3, 'img/avatars');
		expect(store.entries.size).toBe(0);
		expect(await avatars.urlFor(3, 'img/avatars')).toBeNull();
	});

	it('une seule lecture de la liste par minute pour toute une page', async () => {
		let now = 1000;
		const store = new MemoryFileStore(() => now);
		let listings = 0;
		const list = store.list.bind(store);
		store.list = async (prefix) => {
			listings += 1;
			return list(prefix);
		};
		await store.put('img/avatars/5.jpg', bytes('jpg'), 'image/jpeg');
		const avatars = new AvatarFiles(store, () => now);
		await Promise.all([avatars.urlFor(5, 'img/avatars'), avatars.urlFor(6, 'img/avatars'), avatars.urlFor(5, 'img/avatars')]);
		expect(listings).toBe(1);
		// Écrit par un autre isolat : visible après une minute.
		await store.put('img/avatars/6.gif', bytes('gif'), 'image/gif');
		expect(await avatars.urlFor(6, 'img/avatars')).toBeNull();
		now += 60;
		expect(await avatars.urlFor(6, 'img/avatars')).toBe('/img/avatars/6.gif?m=1000');
		expect(listings).toBe(2);
	});

	it('o_avatars_dir ne désigne qu’un dossier sous img/', () => {
		expect(avatarsDirectory('img/avatars/')).toBe('img/avatars');
		expect(avatarsDirectory('img/membres/photos')).toBe('img/membres/photos');
		for (const dir of ['../secrets', 'img/../x', '/img/avatars', 'img', 'autre/avatars', 'img//a'])
			expect(avatarsDirectory(dir), dir).toBe('img/avatars');
	});
});

describe('GalleryFiles', () => {
	it('image, vignette et variante mobile ; seconde suivante si le nom est pris ; suppression des trois', async () => {
		const store = new MemoryFileStore();
		const gallery = new GalleryFiles(store);
		expect(await gallery.save(1700, 'webp', { image: bytes('i'), thumbnail: bytes('t'), mobile: bytes('m') })).toBe(1700);
		expect(await gallery.save(1700, 'jpg', { image: bytes('i'), thumbnail: bytes('t'), mobile: null })).toBe(1700);
		expect(await gallery.save(1700, 'jpg', { image: bytes('j'), thumbnail: bytes('t'), mobile: null })).toBe(1701);
		expect([...store.entries.keys()].sort()).toEqual([
			'img/gallery/1700.jpg',
			'img/gallery/1700.webp',
			'img/gallery/1701.jpg',
			'img/gallery/mini_1700.jpg',
			'img/gallery/mini_1700.webp',
			'img/gallery/mini_1701.jpg',
			'img/gallery/mobile_1700.webp',
		]);
		expect((await store.head('img/gallery/1700.webp'))?.contentType).toBe('image/webp');
		await gallery.delete(1700, '.webp');
		expect([...store.entries.keys()].filter((key) => key.includes('1700.webp'))).toEqual([]);
	});
});

describe('fichiers orphelins', () => {
	const now = 10 * ORPHAN_MIN_AGE;
	const old = now - ORPHAN_MIN_AGE;

	it('galerie : image, vignette et variante sans ligne en base, plus anciennes qu’un jour', () => {
		const files = [
			{ key: 'img/gallery/1.jpg', uploadedAt: old },
			{ key: 'img/gallery/mini_1.jpg', uploadedAt: old },
			{ key: 'img/gallery/2.webp', uploadedAt: old },
			{ key: 'img/gallery/mobile_2.webp', uploadedAt: old },
			{ key: 'img/gallery/3.png', uploadedAt: now - 60 },
		];
		expect(orphanGalleryKeys(files, 'img/gallery', new Set(['1.jpg']), now)).toEqual(['img/gallery/2.webp', 'img/gallery/mobile_2.webp']);
	});

	it('avatars : membres supprimés et fichiers qui ne sont pas des avatars', () => {
		const files = [
			{ key: 'img/avatars/2.png', uploadedAt: old },
			{ key: 'img/avatars/9.jpg', uploadedAt: old },
			{ key: 'img/avatars/notes.txt', uploadedAt: old },
			{ key: 'img/avatars/8.jpg', uploadedAt: now },
		];
		expect(orphanAvatarKeys(files, new Set([2]), now)).toEqual(['img/avatars/9.jpg', 'img/avatars/notes.txt']);
	});

	it('tâche planifiée : purge de online puis effacement dans R2', async () => {
		const store = new MemoryFileStore(() => old);
		for (const key of ['img/gallery/1.jpg', 'img/gallery/mini_1.jpg', 'img/gallery/2.jpg', 'img/avatars/2.png', 'img/avatars/9.png'])
			await store.put(key, bytes('x'), 'image/png');
		const purges: unknown[] = [];
		const logged: string[] = [];
		const tasks = new ScheduledTasks({
			translation: null,
			config: { load: async () => boardConfig },
			online: {
				listStale: async () => [{ userId: 1, ident: '192.0.2.1', logged: 0, idle: false }],
				applyPurge: async (purge) => {
					purges.push(purge);
				},
			},
			files: store,
			fileReferences: {
				galleryFileNames: async () => new Set(['1.jpg']),
				existingUserIds: async (ids) => new Set(ids.filter((id) => id === 2)),
			},
			clock: () => now,
			logger: { info: (_context, message) => logged.push(message), error: (_context, message) => logged.push(message) },
		});
		await tasks.run();
		expect(purges).toHaveLength(1);
		expect([...store.entries.keys()].sort()).toEqual(['img/avatars/2.png', 'img/gallery/1.jpg', 'img/gallery/mini_1.jpg']);
		expect(logged).toEqual(['Fichiers orphelins effacés']);
	});

	it('une tâche en échec n’empêche pas la suivante', async () => {
		const store = new MemoryFileStore(() => old);
		await store.put('img/gallery/7.jpg', bytes('x'), 'image/jpeg');
		const errors: unknown[] = [];
		const tasks = new ScheduledTasks({
			translation: null,
			config: { load: async () => boardConfig },
			online: {
				listStale: async () => {
					throw new Error('base indisponible');
				},
				applyPurge: async () => undefined,
			},
			files: store,
			fileReferences: { galleryFileNames: async () => new Set(), existingUserIds: async () => new Set() },
			clock: () => now,
			logger: { info: () => undefined, error: (context) => errors.push(context.task) },
		});
		await tasks.run();
		expect(errors).toEqual(['online']);
		expect(store.entries.size).toBe(0);
	});
});

describe('cache en bordure', () => {
	function fakeCache(): EdgeCache & { stored: Map<string, Response> } {
		const stored = new Map<string, Response>();
		return {
			stored,
			match: async (request) => stored.get(request.url)?.clone(),
			put: async (request, response) => {
				stored.set(request.url, response);
			},
		};
	}

	const page =
		(headers: Record<string, string> = {}) =>
		async () =>
			new Response('<p>page</p>', {
				headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': PAGE_CACHE_CONTROL, ...headers },
			});

	it('fichiers /img/ en GET : gardés une heure en bordure, servis ensuite sans le Worker', async () => {
		const cache = fakeCache();
		const pending: Promise<unknown>[] = [];
		let calls = 0;
		const handler = async () => {
			calls += 1;
			return new Response('image', { headers: { 'cache-control': 'public, max-age=604800' } });
		};
		const request = new Request('https://forum.test/img/gallery/1.jpg', { headers: { cookie: 'avrobb_session=x' } });
		const first = await withEdgeCache(request, cache, 'avrobb', (promise) => pending.push(promise), handler);
		await Promise.all(pending);
		expect(await first.text()).toBe('image');
		expect(first.headers.get('cache-control')).toBe('public, max-age=604800');
		expect(cache.stored.get(request.url)?.headers.get('cache-control')).toBe(`public, max-age=${EDGE_TTL}`);
		expect(await (await withEdgeCache(request, cache, 'avrobb', () => undefined, handler)).text()).toBe('image');
		expect(calls).toBe(1);
	});

	it('page d’un visiteur sans cookie du forum : gardée une minute, le navigateur revalide toujours', async () => {
		const cache = fakeCache();
		const pending: Promise<unknown>[] = [];
		let calls = 0;
		const handler = async () => {
			calls += 1;
			return page()();
		};
		const request = new Request('https://forum.test/sujet/4-vol', { headers: { cookie: 'autre=1' } });
		const first = await withEdgeCache(request, cache, 'avrobb', (promise) => pending.push(promise), handler);
		await Promise.all(pending);
		expect(first.headers.get('cache-control')).toBe(PAGE_CACHE_CONTROL);
		expect(cache.stored.get('https://forum.test/sujet/4-vol')?.headers.get('cache-control')).toBe(`public, max-age=${PAGE_TTL}`);
		const second = await withEdgeCache(new Request('https://forum.test/sujet/4-vol'), cache, 'avrobb', () => undefined, handler);
		expect(await second.text()).toBe('<p>page</p>');
		expect(second.headers.get('cache-control')).toBe(PAGE_CACHE_CONTROL);
		expect(calls).toBe(1);
	});

	it('membre, jeton CSRF ou suivi de lecture (préfixe __Host- compris) : ni servi par le cache, ni gardé', async () => {
		const cache = fakeCache();
		cache.stored.set('https://forum.test/', new Response('version invité'));
		for (const cookie of ['avrobb_session=1', '__Host-avrobb_csrf=2', 'x=1; avrobb_track=3']) {
			const request = new Request('https://forum.test/', { headers: { cookie } });
			expect(isEdgeCacheable(request, 'avrobb'), cookie).toBe(false);
			expect(
				await (
					await withEdgeCache(
						request,
						cache,
						'avrobb',
						() => undefined,
						async () => new Response('membre'),
					)
				).text(),
			).toBe('membre');
		}
		expect(cache.stored.size).toBe(1);
	});

	it('POST, erreurs, réponses qui posent un cookie ou interdites de cache : jamais gardées', async () => {
		const cache = fakeCache();
		const ok = page();
		await withEdgeCache(new Request('https://forum.test/index.php', { method: 'POST', body: 'x' }), cache, 'avrobb', () => undefined, ok);
		await withEdgeCache(
			new Request('https://forum.test/a'),
			cache,
			'avrobb',
			() => undefined,
			async () => new Response('', { status: 404 }),
		);
		await withEdgeCache(new Request('https://forum.test/b'), cache, 'avrobb', () => undefined, page({ 'set-cookie': 'avrobb_csrf=1' }));
		await withEdgeCache(new Request('https://forum.test/c'), cache, 'avrobb', () => undefined, page({ 'cache-control': 'no-store' }));
		await withEdgeCache(
			new Request('https://forum.test/d.json'),
			cache,
			'avrobb',
			() => undefined,
			async () => Response.json({}),
		);
		await withEdgeCache(
			new Request('https://forum.test/img/e.png'),
			cache,
			'avrobb',
			() => undefined,
			async () => new Response('x'),
		);
		expect(cache.stored.size).toBe(0);
	});
});
