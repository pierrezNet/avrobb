/**
 * Galerie de PV : consultation échappée, filtre « Mes images », envoi (vignette fournie par le
 * navigateur), suppression et sélecteur d'images à insérer dans un message.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { type GalleryImage, GroupId } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { canDeleteGalleryImage, galleryInsertCode, validateGalleryUpload } from '../src/services/gallery.ts';
import { buildLegacyCookie } from '../src/services/legacySession.ts';
import { type FakeData, fakeDeps, group, guest, NOW, viewer } from './fixtures.ts';

const SEED = 'graine-de-test';
const CSRF_SECRET = 'e'.repeat(64);

const image = (id: number, overrides: Partial<GalleryImage> = {}): GalleryImage => ({
	id,
	title: `<b>Image ${id}</b>`,
	userId: 6,
	username: 'valdefsx',
	description: '[i]Belle[/i] vue',
	addedAt: 1_705_145_502 + id,
	extension: '.jpg',
	...overrides,
});

/** En-têtes d'images minimales (getimagesize()). */
const jpeg = (width: number, height: number): Buffer =>
	Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x01, 0x01, 0x11, 0x00]);
const png = Buffer.concat([
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]),
	Buffer.from('IHDR', 'latin1'),
	Buffer.from([0, 0, 2, 0, 0, 0, 1, 0, 8, 2, 0, 0, 0]),
]);

describe('règles de la galerie', () => {
	it('titre, description, type lu dans le contenu', () => {
		const ok = validateGalleryUpload({ title: ' Vol ', description: 'Au [b]soleil[/b]', image: png });
		expect(ok).toMatchObject({ errors: [], title: 'Vol', imageOk: true });
		expect(validateGalleryUpload({ title: 'a', description: 'b', image: jpeg(300, 300) }).imageOk).toBe(true);
		expect(validateGalleryUpload({ title: '', description: '', image: Buffer.from('<?php') }).errors).toEqual([
			'noTitle',
			'noDescription',
			'badType',
		]);
	});

	it("suppression : l'auteur, les administrateurs, le groupe des modérateurs", () => {
		expect(canDeleteGalleryImage(viewer({ id: 6 }), { userId: 6 })).toBe(true);
		expect(canDeleteGalleryImage(viewer(), { userId: 6 })).toBe(false);
		expect(canDeleteGalleryImage(viewer({ group: group({ id: GroupId.Moderator }) }), { userId: 6 })).toBe(true);
		expect(canDeleteGalleryImage(guest, { userId: 1 })).toBe(false);
	});

	it('BBCode inséré : titre, image et description', () => {
		expect(galleryInsertCode(image(1, { title: 'Vol' }), 'https://pv.test')).toBe(
			'[b]Vol[/b]\n[img]https://pv.test/img/gallery/1705145503.jpg[/img]\n[i]Belle[/i] vue',
		);
	});
});

const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true }) });
const val = viewer({ id: 6, username: 'valdefsx' });
const hashes: Record<number, string> = { 5: 'h5', 6: 'h6', 3: 'h3' };
const cookies = (userId: number): string =>
	`punbb_cookie=${buildLegacyCookie(userId, hashes[userId] ?? '', NOW + 3600, SEED)}; punbb_cookie_csrf=${CSRF_SECRET}`;

function data(overrides: Partial<FakeData> = {}): FakeData {
	return {
		users: [
			{ viewer: guest, passwordHash: '' },
			{ viewer: mod, passwordHash: 'h5' },
			{ viewer: val, passwordHash: 'h6' },
			{ viewer: viewer(), passwordHash: 'h3' },
		],
		topics: [],
		posts: new Map(),
		galleryImages: Array.from({ length: 25 }, (_, i) => image(i + 1, i === 0 ? { userId: 3, username: 'Tessy' } : {})),
		...overrides,
	};
}

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

const get = (server: FastifyInstance, userId: number, url: string) => server.inject({ url, headers: { cookie: cookies(userId) } });

describe('GET /gallery.php', () => {
	it('affiche 20 images par page, titres échappés, liens vers les fichiers du PHP', async () => {
		app = await buildApp(fakeDeps(data()));
		const res = await app.inject('/gallery.php');
		expect(res.statusCode).toBe(200);
		expect(res.body.match(/class="gallery__item"/g)).toHaveLength(20);
		expect(res.body).toContain('&lt;b&gt;Image 1&lt;/b&gt;');
		expect(res.body).toContain('src="http://php.test/img/gallery/mini_1705145503.jpg"');
		expect(res.body).toContain('<em>Belle</em> vue');
		expect(res.body).toContain('href="gallery.php?p=2"');
		expect(res.body).not.toContain('info=new');
		expect(res.body).not.toContain('option=del');
	});

	it('« Mes images » ne montre que celles du membre, avec leur lien de suppression', async () => {
		app = await buildApp(fakeDeps(data()));
		const res = await get(app, 3, '/gallery.php?mine=1');
		expect(res.body.match(/class="gallery__item"/g)).toHaveLength(1);
		expect(res.body).toContain('href="gallery.php?mine=1" aria-current="page"');
		expect(res.body).toContain('href="gallery.php?info=modo&amp;option=del&amp;id=1"');
	});

	it('modérateur : liens d’envoi, de modération et de suppression', async () => {
		app = await buildApp(fakeDeps(data()));
		const res = await get(app, 5, '/gallery.php?info=modo');
		expect(res.body).toContain('href="gallery.php?info=new"');
		expect(res.body).toContain('href="gallery.php?info=modo"');
		expect(res.body.match(/option=del/g)).toHaveLength(20);
	});

	it('envoi réservé aux membres', async () => {
		app = await buildApp(fakeDeps(data()));
		expect((await app.inject('/gallery.php?info=new')).statusCode).toBe(403);
		expect((await get(app, 3, '/gallery.php?info=new')).body).toContain('data-gallery-upload');
	});
});

async function upload(
	server: FastifyInstance,
	userId: number,
	url: string,
	fields: Record<string, string>,
	files: Record<string, [string, Buffer]>,
) {
	const form = new FormData();
	form.append('csrf_token', csrfToken(CSRF_SECRET, SEED, userId));
	for (const [name, value] of Object.entries(fields)) form.append(name, value);
	for (const [name, [fileName, content]] of Object.entries(files)) form.append(name, new Blob([new Uint8Array(content)]), fileName);
	const request = new Request('http://x/', { method: 'POST', body: form });
	return server.inject({
		method: 'POST',
		url,
		headers: { cookie: cookies(userId), 'content-type': request.headers.get('content-type') ?? '' },
		payload: Buffer.from(await request.arrayBuffer()),
	});
}

describe('POST /gallery.php', () => {
	it('convertit en WebP (1024 px, vignette 150 px, variante mobile 640 px) et redirige', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const res = await upload(
			app,
			3,
			'/gallery.php?info=new',
			{ titre: 'Vol de nuit', description: 'Au-dessus de Lyon' },
			{
				req_file: ['vol.png', png],
			},
		);
		expect(res.statusCode).toBe(303);
		expect(res.headers.location).toBe('gallery.php?done=added');
		expect(fake.galleryFileLog).toEqual([`save ${NOW}.webp webp1024:${png.length} webp150:${png.length} webp640:${png.length}`]);
		expect(fake.galleryImages?.[0]).toMatchObject({ title: 'Vol de nuit', userId: 3, addedAt: NOW, extension: '.webp' });
	});

	it('réaffiche le formulaire avec les erreurs', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const res = await upload(app, 3, '/gallery.php?info=new', { titre: 'Sans description', description: '' }, { req_file: ['x.png', png] });
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('Vous n&#39;avez pas donné de description à votre image.');
		expect(res.body).toContain('value="Sans description"');
		expect(fake.galleryFileLog).toBeUndefined();
	});

	it('depuis le sélecteur : retour au sélecteur, qui propose « Insérer » avec titre et description', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const res = await upload(
			app,
			3,
			'/gallery.php?info=new&from=pick',
			{ titre: 'Cockpit', description: 'Le [b]tableau de bord[/b]' },
			{
				req_file: ['c.png', png],
			},
		);
		expect(res.headers.location).toBe('gallery.php?info=pick&done=added');
		expect(fake.galleryFileLog).toEqual([`save ${NOW}.webp webp1024:${png.length} webp150:${png.length} webp640:${png.length}`]);

		const picker = await get(app, 3, '/gallery.php?info=pick&done=added');
		expect(picker.body).toContain('Votre image a été envoyée correctement.');
		expect(picker.body).toContain(
			`data-insert="[b]Cockpit[/b]\n[img]http://forum.test/img/gallery/${NOW}.webp[/img]\nLe [b]tableau de bord[/b]"`,
		);
		// Seules les images du membre sont proposées.
		expect(picker.body).not.toContain('Image 2');
	});

	it('popin : page nue, images à cocher, la nouvelle cochée d’office', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const res = await upload(
			app,
			3,
			'/gallery.php?info=new&from=pick&embed=1',
			{ titre: 'Cockpit', description: 'Vue' },
			{ req_file: ['c.png', png] },
		);
		expect(res.headers.location).toBe('gallery.php?info=pick&done=added&embed=1');

		const picker = await get(app, 3, '/gallery.php?info=pick&done=added&embed=1');
		expect(picker.body).not.toContain('site-header');
		expect(picker.body).toContain('<input type="hidden" name="embed" value="1">');
		expect(picker.body).toContain('action="gallery.php?info=new&amp;from=pick&amp;embed=1"');
		expect(picker.body).toMatch(/name="pick" value="\[b\]Cockpit\[\/b\][^"]*"[^>]*checked/);
		expect(picker.body).not.toContain('data-insert=');
	});

	it('sélecteur : recherche dans le titre et la description, ses images ou toute la galerie', async () => {
		app = await buildApp(fakeDeps(data()));
		const mine = await get(app, 6, '/gallery.php?info=pick&q=image%201');
		expect(mine.body).toContain('Image 10');
		expect(mine.body).not.toContain('Image 2&lt;');
		expect(mine.body).not.toContain('Image 1&lt;');
		expect(mine.body).toContain('value="image 1"');

		const all = await get(app, 6, '/gallery.php?info=pick&scope=all&q=image%201');
		expect(all.body).toContain('&lt;b&gt;Image 1&lt;/b&gt;');
		expect(all.body).toContain('par Tessy');
		expect(all.body).toContain('<option value="all" selected>');

		const none = await get(app, 6, '/gallery.php?info=pick&q=zzz');
		expect(none.body).toContain('Aucune image ne correspond à cette recherche.');
	});

	it('supprime après confirmation, si le lecteur en a le droit', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		expect((await get(app, 3, '/gallery.php?info=modo&option=del&id=2')).statusCode).toBe(403);
		const confirm = await get(app, 3, '/gallery.php?info=modo&option=del&id=1');
		expect(confirm.body).toContain('action="gallery.php?info=modo&amp;option=del&amp;id=1"');

		const body = new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, 3) });
		const res = await app.inject({
			method: 'POST',
			url: '/gallery.php?info=modo&option=del&id=1',
			headers: { cookie: cookies(3), 'content-type': 'application/x-www-form-urlencoded' },
			payload: body.toString(),
		});
		expect(res.headers.location).toBe('gallery.php?done=deleted');
		expect(fake.galleryImages?.some((i) => i.id === 1)).toBe(false);
		expect(fake.galleryFileLog).toEqual(['delete 1705145503.jpg']);
	});
});

describe('Images de l’installation PHP (/img/)', () => {
	it('sert les images et rien d’autre', async () => {
		const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
		const { tmpdir } = await import('node:os');
		const path = await import('node:path');
		const root = await mkdtemp(path.join(tmpdir(), 'pv-img-'));
		await mkdir(path.join(root, 'gallery'));
		await writeFile(path.join(root, 'gallery', '1.webp'), 'RIFF');
		await writeFile(path.join(root, 'gallery', 'index.html'), '<p>');
		const app = await buildApp(fakeDeps(data(), { legacyImagesRoot: root }));
		try {
			const ok = await app.inject({ url: '/img/gallery/1.webp' });
			expect(ok.statusCode).toBe(200);
			expect(ok.headers['content-type']).toBe('image/webp');
			const refused = await app.inject({ url: '/img/gallery/index.html' });
			expect(refused.statusCode).toBe(404);
			expect((await app.inject({ url: '/img/../package.json' })).statusCode).toBe(404);
		} finally {
			await app.close();
		}
	});
});
