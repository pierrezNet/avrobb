/**
 * Galerie de PV : consultation échappée, renvois vers le PHP pour l'envoi et la modération.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { type GalleryImage, GroupId } from '../src/domain/models.ts';
import { forumHmac } from '../src/services/legacySession.ts';
import { fakeDeps, group, guest, NOW, viewer } from './fixtures.ts';

const image = (id: number): GalleryImage => ({
	id,
	title: `<b>Image ${id}</b>`,
	username: 'Tessy',
	description: '[i]Belle[/i] vue',
	addedAt: 1_705_145_502 + id,
	extension: '.jpg',
});

const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true }) });
const users = [
	{ viewer: guest, passwordHash: '' },
	{ viewer: mod, passwordHash: 'hash-mod' },
];
const cookie = (): string => {
	const expires = NOW + 3600;
	return `punbb_cookie=5|${forumHmac('hash-mod', 'graine-de-test_password_hash')}|${expires}|${forumHmac(`5|${expires}`, 'graine-de-test_cookie_hash')}`;
};

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

describe('GET /gallery.php', () => {
	const deps = () => fakeDeps({ users, topics: [], posts: new Map(), galleryImages: Array.from({ length: 25 }, (_, i) => image(i + 1)) });

	it('affiche 20 images par page, titres échappés, liens vers les fichiers du PHP', async () => {
		app = await buildApp(deps());
		const res = await app.inject('/gallery.php');
		expect(res.statusCode).toBe(200);
		expect(res.body.match(/class="gallery__item"/g)).toHaveLength(20);
		expect(res.body).toContain('&lt;b&gt;Image 1&lt;/b&gt;');
		expect(res.body).toContain('src="http://php.test/img/gallery/mini_1705145503.jpg"');
		expect(res.body).toContain('<em>Belle</em> vue');
		expect(res.body).toContain('href="gallery.php?p=2"');
		expect(res.body).not.toContain('info=new');
	});

	it('modérateur : liens d’envoi et de modération ; ces actions sont servies par le PHP', async () => {
		app = await buildApp(deps());
		const res = await app.inject({ url: '/gallery.php', headers: { cookie: cookie() } });
		expect(res.body).toContain('href="gallery.php?info=new"');
		expect(res.body).toContain('href="gallery.php?info=modo"');

		const del = await app.inject('/gallery.php?info=modo&option=del&id=3');
		expect(del.statusCode).toBe(302);
		expect(del.headers.location).toBe('http://php.test/gallery.php?info=modo&option=del&id=3');
	});
});
