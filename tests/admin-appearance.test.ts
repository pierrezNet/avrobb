/**
 * Apparence (admin_appearance.php) : logo et bannière remplacés après contrôle du type et
 * réencodage, image précédente rétablie, version des adresses changée ; réservé aux administrateurs.
 */

import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { GroupId } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { HeaderImageFiles } from '../src/repositories/HeaderImageFiles.ts';
import { type FakeData, fakeDeps, group, guest, NOW, sessionCookie, viewer } from './fixtures.ts';

const SEED = 'graine-de-test';
const CSRF_SECRET = '7'.repeat(64);
const admin = viewer({ id: 2, username: 'admin', group: group({ id: GroupId.Admin }) });
const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true }) });
const hashes: Record<number, string> = { 2: 'h2', 5: 'h5' };
const cookies = (userId: number): string => `${sessionCookie(userId)}; avrobb_csrf=${CSRF_SECRET}`;
const png = Buffer.concat([
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]),
	Buffer.from('IHDR'),
	Buffer.alloc(13),
]);
png.writeUInt32BE(800, 16);
png.writeUInt32BE(200, 20);

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

async function start(): Promise<{ server: FastifyInstance; fake: FakeData }> {
	const fake: FakeData = {
		users: [{ viewer: guest }, { viewer: admin }, { viewer: mod }],
		topics: [],
		posts: new Map(),
	};
	app = await buildApp(fakeDeps(fake));
	return { server: app, fake };
}

async function send(server: FastifyInstance, userId: number, fields: Record<string, string>, file?: Buffer) {
	const form = new FormData();
	form.append('csrf_token', csrfToken(CSRF_SECRET, SEED, userId));
	for (const [name, value] of Object.entries(fields)) form.append(name, value);
	if (file !== undefined) form.append('image', new Blob([new Uint8Array(file)]), 'image.png');
	const request = new Request('http://x/', { method: 'POST', body: form });
	return server.inject({
		method: 'POST',
		url: '/admin_appearance.php',
		headers: { cookie: cookies(userId), 'content-type': request.headers.get('content-type') ?? '' },
		payload: Buffer.from(await request.arrayBuffer()),
	});
}

describe('admin_appearance.php', () => {
	it('réservé aux administrateurs ; dans le menu ; aperçus des deux images', async () => {
		const { server } = await start();
		expect((await server.inject({ url: '/admin_appearance.php', headers: { cookie: cookies(5) } })).statusCode).toBe(403);
		const page = await server.inject({ url: '/admin_appearance.php', headers: { cookie: cookies(2) } });
		expect(page.statusCode).toBe(200);
		expect(page.body).toContain('href="admin_appearance.php"');
		expect(page.body).toContain('src="/img/logo.png"');
		expect(page.body).toContain('src="/img/banner.jpg"');
		expect(page.body).not.toContain('value="restore"');
		expect((await send(server, 5, { kind: 'logo' }, png)).statusCode).toBe(403);
	});

	it('remplace le logo (PNG réencodé), puis le rétablit ; la version change', async () => {
		const { server, fake } = await start();
		expect((await send(server, 2, { kind: 'logo' }, Buffer.from('pas une image'))).statusCode).toBe(400);
		expect((await send(server, 2, { kind: 'autre' }, png)).statusCode).toBe(400);
		const replaced = await send(server, 2, { kind: 'logo' }, png);
		expect(replaced.headers.location).toBe('admin_appearance.php?done=replaced');
		expect(fake.headerImageLog).toEqual([`replace logo png1204x308:${png.length}`]);
		expect(fake.configValues?.get('o_header_version')).toBe(String(NOW));

		const banner = await send(server, 2, { kind: 'banner' }, png);
		expect(banner.headers.location).toBe('admin_appearance.php?done=replaced');
		expect(fake.headerImageLog?.at(-1)).toBe(`replace banner jpeg2560x800:${png.length}`);

		expect((await server.inject({ url: '/admin_appearance.php', headers: { cookie: cookies(2) } })).body).toContain('value="restore"');
		const restored = await send(server, 2, { kind: 'logo', action: 'restore' });
		expect(restored.headers.location).toBe('admin_appearance.php?done=restored');
		expect(fake.headerImageLog?.at(-1)).toBe('restore logo');
	});

	it('version dans les adresses du logo et de la bannière de l’en-tête', async () => {
		const fake: FakeData = { users: [{ viewer: guest }], topics: [], posts: new Map(), config: { headerVersion: 42 } };
		app = await buildApp(fakeDeps(fake));
		const page = await app.inject('/index.php');
		expect(page.body).toContain('src="/img/logo.png?v=42"');
		expect(page.body).toContain("--header-banner: url('/img/banner.jpg?v=42')");
	});
});

describe('HeaderImageFiles', () => {
	it('garde l’image précédente et l’échange au rétablissement', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'pv-header-'));
		await mkdir(path.join(root, 'img'));
		await writeFile(path.join(root, 'img', 'logo.png'), 'ancien');
		const files = new HeaderImageFiles(root);
		expect(await files.hasPrevious('logo')).toBe(false);
		await files.replace('logo', Buffer.from('nouveau'));
		expect(await readFile(path.join(root, 'img', 'logo.png'), 'utf8')).toBe('nouveau');
		expect(await files.hasPrevious('logo')).toBe(true);
		expect(await files.restore('logo')).toBe(true);
		expect(await readFile(path.join(root, 'img', 'logo.png'), 'utf8')).toBe('ancien');
		expect(await readFile(path.join(root, 'img', 'logo.previous.png'), 'utf8')).toBe('nouveau');
		// Bannière dans un dossier encore absent : créé à la première écriture, rien à rétablir.
		await files.replace('banner', Buffer.from('jpeg'));
		expect(await files.restore('banner')).toBe(false);
	});
});

describe('SharpImageProcessor.fit', () => {
	it('réduit dans le cadre sans agrandir, au format demandé', async () => {
		const { default: sharp } = await import('sharp');
		const { SharpImageProcessor } = await import('../src/adapters/imageProcessor.ts');
		const source = await sharp({ create: { width: 3000, height: 1000, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0.5 } } })
			.png()
			.toBuffer();
		const processor = new SharpImageProcessor();
		const logo = await processor.fit(source, { format: 'png', maxWidth: 1204, maxHeight: 308 });
		expect(logo).toMatchObject({ width: 924, height: 308 });
		expect((await sharp(logo?.data).metadata()).hasAlpha).toBe(true);
		const banner = await processor.fit(source, { format: 'jpeg', maxWidth: 2560, maxHeight: 800 });
		expect(banner).toMatchObject({ width: 2400, height: 800 });
		expect((await sharp(banner?.data).metadata()).format).toBe('jpeg');
		expect(await processor.fit(Buffer.from('rien'), { format: 'png', maxWidth: 10, maxHeight: 10 })).toBeNull();
	});
});
