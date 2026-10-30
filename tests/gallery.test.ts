/**
 * Galerie de PV : consultation échappée, filtre « Mes images », envoi (vignette fournie par le
 * navigateur), suppression et sélecteur d'images à insérer dans un message.
 */

import { describe, expect, it } from 'vitest';
import { buildApp, type ForumApp } from '../src/app.ts';
import { type GalleryImage, GroupId } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import {
	acceptedVariant,
	canDeleteGalleryImage,
	GALLERY_MAX_IMAGES_PER_MEMBER,
	galleryInsertCode,
	galleryQuotaReached,
	validateGalleryUpload,
} from '../src/services/gallery.ts';
import { type FakeData, fakeDeps, group, guest, NOW, sessionCookie, viewer } from './fixtures.ts';
import { inject } from './inject.ts';
import { MemoryFileStore } from './memoryFileStore.ts';

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

/** En-tête WebP étendu (VP8X) aux dimensions voulues, lu par readImageInfo(). */
const webp = (width: number, height: number): Buffer => {
	const data = Buffer.alloc(30);
	data.write('RIFF', 0, 'latin1');
	data.writeUInt32LE(22, 4);
	data.write('WEBPVP8X', 8, 'latin1');
	data.writeUInt32LE(10, 16);
	data.writeUIntLE(width - 1, 24, 3);
	data.writeUIntLE(height - 1, 27, 3);
	return data;
};

describe('règles de la galerie', () => {
	it('titre, description, type lu dans le contenu', () => {
		const ok = validateGalleryUpload({ title: ' Vol ', description: 'Au [b]soleil[/b]', image: png });
		expect(ok).toMatchObject({ errors: [], title: 'Vol', image: { type: 'png', width: 512, height: 256 } });
		expect(validateGalleryUpload({ title: 'a', description: 'b', image: jpeg(300, 300) }).image?.type).toBe('jpg');
		expect(validateGalleryUpload({ title: '', description: '', image: Buffer.from('<?php') }).errors).toEqual([
			'noTitle',
			'noDescription',
			'badType',
		]);
	});

	it('poids et dimensions plafonnés : l’image est gardée telle quelle', () => {
		const large = validateGalleryUpload({ title: 'a', description: 'b', image: jpeg(5000, 300) });
		expect(large).toMatchObject({ errors: ['tooWide'], image: null });
		const heavy = Buffer.concat([jpeg(300, 300), Buffer.alloc(1_600_000)]);
		expect(validateGalleryUpload({ title: 'a', description: 'b', image: heavy })).toMatchObject({ errors: ['tooLarge'], image: null });
	});

	it('variante du navigateur : même format, côté et poids plafonnés', () => {
		const thumb = webp(150, 100);
		expect(acceptedVariant(thumb, 'webp', 150)).toBe(thumb);
		expect(acceptedVariant(webp(151, 100), 'webp', 150)).toBeNull();
		expect(acceptedVariant(thumb, 'jpg', 150)).toBeNull();
		expect(acceptedVariant(Buffer.from('<?php'), 'webp', 150)).toBeNull();
		expect(acceptedVariant(undefined, 'webp', 150)).toBeNull();
	});

	it('quota d’images par membre, sauf pour les administrateurs', () => {
		expect(galleryQuotaReached(viewer(), GALLERY_MAX_IMAGES_PER_MEMBER - 1)).toBe(false);
		expect(galleryQuotaReached(viewer(), GALLERY_MAX_IMAGES_PER_MEMBER)).toBe(true);
		expect(galleryQuotaReached(viewer({ group: group({ id: GroupId.Admin }) }), 10_000)).toBe(false);
	});

	it("suppression : l'auteur, les administrateurs, le groupe des modérateurs", () => {
		expect(canDeleteGalleryImage(viewer({ id: 6 }), { userId: 6 })).toBe(true);
		expect(canDeleteGalleryImage(viewer(), { userId: 6 })).toBe(false);
		expect(canDeleteGalleryImage(viewer({ group: group({ id: GroupId.Moderator }) }), { userId: 6 })).toBe(true);
		expect(canDeleteGalleryImage(guest, { userId: 1 })).toBe(false);
	});

	it('BBCode inséré : titre, image et description', () => {
		// Adresse relative : elle reste juste quand le forum change de domaine.
		expect(galleryInsertCode(image(1, { title: 'Vol' }))).toBe('[b]Vol[/b]\n[img]/img/gallery/1705145503.jpg[/img]\n[i]Belle[/i] vue');
	});
});

const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true }) });
const val = viewer({ id: 6, username: 'valdefsx' });
const cookies = (userId: number): string => `${sessionCookie(userId)}; avrobb_csrf=${CSRF_SECRET}`;

function data(overrides: Partial<FakeData> = {}): FakeData {
	return {
		users: [{ viewer: guest }, { viewer: mod }, { viewer: val }, { viewer: viewer() }],
		topics: [],
		posts: new Map(),
		galleryImages: Array.from({ length: 25 }, (_, i) => image(i + 1, i === 0 ? { userId: 3, username: 'Tessy' } : {})),
		...overrides,
	};
}

let app: ForumApp | undefined;

const get = (server: ForumApp, userId: number, url: string) => inject(server, { url, headers: { cookie: cookies(userId) } });

describe('GET /gallery.php', () => {
	it('recherche dans le titre et la description, pagination et filtres la conservent', async () => {
		app = await buildApp(fakeDeps(data()));
		const res = await get(app, 6, '/gallery.php?q=image%201');
		expect(res.body).toContain('role="search"');
		expect(res.body).toContain('value="image 1"');
		expect(res.body).toContain('Image 10');
		expect(res.body).not.toContain('Image 2&lt;');
		expect(res.body).toContain('href="gallery.php?mine=1&amp;q=image%201"');
		expect(res.body).toContain('<meta name="robots" content="noindex');
		const none = await get(app, 6, '/gallery.php?mine=1&q=zzz');
		expect(none.body).toContain('Aucune image ne correspond à cette recherche.');
		expect(none.body).toContain('<input type="hidden" name="mine" value="1">');
	});

	it('affiche 20 images par page, titres échappés, liens vers les fichiers du stockage', async () => {
		app = await buildApp(fakeDeps(data()));
		const res = await inject(app, '/gallery.php');
		expect(res.statusCode).toBe(200);
		expect(res.body.match(/class="gallery__item"/g)).toHaveLength(20);
		expect(res.body).toContain('&lt;b&gt;Image 1&lt;/b&gt;');
		expect(res.body).toContain('src="img/gallery/mini_1705145503.jpg"');
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
		expect((await inject(app, '/gallery.php?info=new')).statusCode).toBe(403);
		expect((await get(app, 3, '/gallery.php?info=new')).body).toContain('data-gallery-upload');
	});
});

async function upload(
	server: ForumApp,
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
	return inject(server, {
		method: 'POST',
		url,
		headers: { cookie: cookies(userId), 'content-type': request.headers.get('content-type') ?? '' },
		payload: Buffer.from(await request.arrayBuffer()),
	});
}

describe('POST /gallery.php', () => {
	it('garde l’image telle quelle, qui sert aussi de vignette, et redirige', async () => {
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
		expect(fake.galleryFileLog).toEqual([`save ${NOW}.png ${png.length} ${png.length} -`]);
		expect(fake.galleryImages?.[0]).toMatchObject({ title: 'Vol de nuit', userId: 3, addedAt: NOW, extension: '.png' });
	});

	it('image réduite par le navigateur : vignette et variante mobile envoyées avec elle', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const res = await upload(
			app,
			3,
			'/gallery.php?info=new',
			{ titre: 'Vol', description: 'Réduite' },
			{
				req_file: ['vol.webp', webp(1024, 768)],
				req_file_mobile: ['vol.webp', webp(640, 480)],
				req_file_thumb: ['vol.webp', webp(150, 112)],
			},
		);
		expect(res.headers.location).toBe('gallery.php?done=added');
		expect(fake.galleryFileLog).toEqual([`save ${NOW}.webp 30 30 30`]);
		expect(fake.galleryImages?.[0]).toMatchObject({ extension: '.webp' });
	});

	it('variante invalide : remplacée par l’image elle-même', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const big = Buffer.concat([webp(1024, 768), Buffer.alloc(10)]);
		await upload(
			app,
			3,
			'/gallery.php?info=new',
			{ titre: 'Vol', description: 'x' },
			{ req_file: ['v.webp', big], req_file_thumb: ['v.png', png] },
		);
		expect(fake.galleryFileLog).toEqual([`save ${NOW}.webp 40 40 40`]);
	});

	it('quota atteint : refusé, rien n’est écrit', async () => {
		const many = Array.from({ length: GALLERY_MAX_IMAGES_PER_MEMBER }, (_, index) => image(100 + index, { userId: 3 }));
		const fake = data({ galleryImages: many });
		app = await buildApp(fakeDeps(fake));
		const res = await upload(app, 3, '/gallery.php?info=new', { titre: 'Vol', description: 'x' }, { req_file: ['v.png', png] });
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('Vous avez atteint la limite de 200 images');
		expect(fake.galleryFileLog).toBeUndefined();
	});

	it('formulaire : consigne de réduction pour le navigateur', async () => {
		app = await buildApp(fakeDeps(data()));
		const form = await inject(app, { url: '/gallery.php?info=new', headers: { cookie: cookies(3) } });
		expect(form.body).toContain(
			'data-resize="contain" data-resize-width="1024" data-resize-height="1024" data-resize-variants="req_file_mobile:640 req_file_thumb:150"',
		);
		expect(form.body).toContain('js/image-resize.js');
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
		expect(fake.galleryFileLog).toEqual([`save ${NOW}.png ${png.length} ${png.length} -`]);

		const picker = await get(app, 3, '/gallery.php?info=pick&done=added');
		expect(picker.body).toContain('Votre image a été envoyée correctement.');
		expect(picker.body).toContain(`data-insert="[b]Cockpit[/b]\n[img]/img/gallery/${NOW}.png[/img]\nLe [b]tableau de bord[/b]"`);
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
		const res = await inject(app, {
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

describe('Fichiers envoyés (/img/, R2)', () => {
	async function server() {
		const files = new MemoryFileStore();
		await files.put('img/gallery/1.webp', new TextEncoder().encode('RIFF'), 'image/webp');
		await files.put('img/gallery/index.html', new TextEncoder().encode('<p>'), 'text/html');
		return buildApp(fakeDeps(data(), { files }));
	}

	it('sert les images avec leur type, un ETag et un cache public ; rien d’autre', async () => {
		const app = await server();
		const ok = await inject(app, { url: '/img/gallery/1.webp' });
		expect(ok.statusCode).toBe(200);
		expect(ok.headers['content-type']).toBe('image/webp');
		expect(ok.headers['cache-control']).toBe('public, max-age=604800');
		expect(ok.headers['x-content-type-options']).toBe('nosniff');
		expect(ok.body).toBe('RIFF');
		const etag = String(ok.headers.etag ?? '');
		expect(etag).not.toBe('');
		const unchanged = await inject(app, { url: '/img/gallery/1.webp', headers: { 'if-none-match': etag } });
		expect(unchanged.statusCode).toBe(304);
		expect((await inject(app, { url: '/img/gallery/index.html' })).statusCode).toBe(404);
		expect((await inject(app, { url: '/img/gallery/absent.webp' })).statusCode).toBe(404);
		expect((await inject(app, { url: '/img/gallery/%2e%2e/1.webp' })).statusCode).toBe(404);
	});
});
