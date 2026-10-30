/**
 * Apparence (admin_appearance.php) : logo et bannière remplacés après contrôle du type et des
 * dimensions, image précédente rétablie (R2), version des adresses changée ; réservé aux administrateurs.
 */

import { describe, expect, it } from 'vitest';
import { buildApp, type ForumApp } from '../src/app.ts';
import { GroupId } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { HeaderImageFiles } from '../src/repositories/HeaderImageFiles.ts';
import { type FakeData, fakeDeps, group, guest, NOW, sessionCookie, viewer } from './fixtures.ts';
import { inject } from './inject.ts';
import { MemoryFileStore } from './memoryFileStore.ts';

const SEED = 'graine-de-test';
const CSRF_SECRET = '7'.repeat(64);
const admin = viewer({ id: 2, username: 'admin', group: group({ id: GroupId.Admin }) });
const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true }) });
const cookies = (userId: number): string => `${sessionCookie(userId)}; avrobb_csrf=${CSRF_SECRET}`;
const png = Buffer.concat([
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]),
	Buffer.from('IHDR'),
	Buffer.alloc(13),
]);
png.writeUInt32BE(800, 16);
png.writeUInt32BE(200, 20);

let app: ForumApp | undefined;

async function start(): Promise<{ server: ForumApp; fake: FakeData }> {
	const fake: FakeData = {
		users: [{ viewer: guest }, { viewer: admin }, { viewer: mod }],
		topics: [],
		posts: new Map(),
	};
	app = await buildApp(fakeDeps(fake));
	return { server: app, fake };
}

async function send(server: ForumApp, userId: number, fields: Record<string, string>, file?: Buffer) {
	const form = new FormData();
	form.append('csrf_token', csrfToken(CSRF_SECRET, SEED, userId));
	for (const [name, value] of Object.entries(fields)) form.append(name, value);
	if (file !== undefined) form.append('image', new Blob([new Uint8Array(file)]), 'image.png');
	const request = new Request('http://x/', { method: 'POST', body: form });
	return inject(server, {
		method: 'POST',
		url: '/admin_appearance.php',
		headers: { cookie: cookies(userId), 'content-type': request.headers.get('content-type') ?? '' },
		payload: Buffer.from(await request.arrayBuffer()),
	});
}

describe('admin_appearance.php', () => {
	it('réservé aux administrateurs ; dans le menu ; aperçus des deux images', async () => {
		const { server } = await start();
		expect((await inject(server, { url: '/admin_appearance.php', headers: { cookie: cookies(5) } })).statusCode).toBe(403);
		const page = await inject(server, { url: '/admin_appearance.php', headers: { cookie: cookies(2) } });
		expect(page.statusCode).toBe(200);
		expect(page.body).toContain('href="/admin_appearance.php"');
		// Aucune image envoyée : celles d'AvroBB.
		expect(page.body).toContain('src="/assets/img/avrobb-logo.png"');
		expect(page.body).toContain('src="/assets/img/avrobb-banner.jpg"');
		expect(page.body).not.toContain('value="restore"');
		expect((await send(server, 5, { kind: 'logo' }, png)).statusCode).toBe(403);
	});

	it('remplace le logo (gardé tel quel), puis le rétablit ; la version change', async () => {
		const { server, fake } = await start();
		expect((await send(server, 2, { kind: 'logo' }, Buffer.from('pas une image'))).statusCode).toBe(400);
		expect((await send(server, 2, { kind: 'autre' }, png)).statusCode).toBe(400);
		const replaced = await send(server, 2, { kind: 'logo' }, png);
		expect(replaced.headers.location).toBe('/admin_appearance.php?done=replaced');
		expect(fake.headerImageLog).toEqual([`replace logo image/png ${png.length}`]);
		// Plus grand que le cadre du logo (1 204 × 308) : refusé, rien n'est écrit.
		const wide = Buffer.from(png);
		wide.writeUInt32BE(1300, 16);
		const refused = await send(server, 2, { kind: 'logo' }, wide);
		expect(refused.statusCode).toBe(400);
		expect(refused.body).toContain('réduisez-la');
		expect(fake.headerImageLog).toHaveLength(1);
		expect(fake.configValues?.get('o_header_version')).toBe(String(NOW));

		const banner = await send(server, 2, { kind: 'banner' }, png);
		expect(banner.headers.location).toBe('/admin_appearance.php?done=replaced');
		expect(fake.headerImageLog?.at(-1)).toBe(`replace banner image/png ${png.length}`);

		expect((await inject(server, { url: '/admin_appearance.php', headers: { cookie: cookies(2) } })).body).toContain('value="restore"');
		const restored = await send(server, 2, { kind: 'logo', action: 'restore' });
		expect(restored.headers.location).toBe('/admin_appearance.php?done=restored');
		expect(fake.headerImageLog?.at(-1)).toBe('restore logo');
	});

	it('version dans les adresses du logo et de la bannière de l’en-tête', async () => {
		const fake: FakeData = { users: [{ viewer: guest }], topics: [], posts: new Map(), config: { headerVersion: 42 } };
		app = await buildApp(fakeDeps(fake));
		const page = await inject(app, '/index.php');
		expect(page.body).toContain('src="/img/logo.png?v=42"');
		expect(page.body).toContain("--header-banner: url('/img/banner.jpg?v=42')");
	});
});

describe('HeaderImageFiles', () => {
	it('garde l’image précédente (celle d’AvroBB au premier envoi) et l’échange au rétablissement', async () => {
		const store = new MemoryFileStore();
		const defaults: string[] = [];
		const files = new HeaderImageFiles(store, async (assetPath) => {
			defaults.push(assetPath);
			return assetPath.endsWith('.png') ? { data: Buffer.from('avrobb'), contentType: 'image/png' } : null;
		});
		expect(await files.hasPrevious('logo')).toBe(false);
		await files.replace('logo', Buffer.from('nouveau'), 'image/webp');
		expect(store.text('img/logo.png')).toBe('nouveau');
		expect(store.text('img/logo.previous.png')).toBe('avrobb');
		// Version commune : la bannière d'AvroBB est déposée aussi (introuvable ici, pas de .jpg).
		expect(defaults).toEqual(['img/avrobb-logo.png', 'img/avrobb-banner.jpg']);
		await files.replace('logo', Buffer.from('troisième'), 'image/png');
		expect(store.text('img/logo.previous.png')).toBe('nouveau');
		expect((await store.head('img/logo.previous.png'))?.contentType).toBe('image/webp');
		expect(await files.hasPrevious('logo')).toBe(true);
		expect(await files.restore('logo')).toBe(true);
		expect(store.text('img/logo.png')).toBe('nouveau');
		expect(store.text('img/logo.previous.png')).toBe('troisième');
		// Image d'AvroBB introuvable : pas d'image précédente, rien à rétablir.
		await files.replace('banner', Buffer.from('jpeg'), 'image/jpeg');
		expect(await files.restore('banner')).toBe(false);
	});
});
