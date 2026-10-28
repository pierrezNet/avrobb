/**
 * Référencement : extrait de description, première image, robots.txt, sitemap.xml, balises
 * description, canonique absolue et aperçu de partage (Open Graph) des pages.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { sitemapXml } from '../src/presenters/sitemap.ts';
import { firstImageUrl, plainExcerpt, robotsTxt } from '../src/services/seo.ts';
import { fakeDeps, guest, post, topic } from './fixtures.ts';

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

describe('référencement : fonctions pures', () => {
	it('extrait sans BBCode, citations, images ni HTML, coupé sur un mot', () => {
		expect(plainExcerpt('[quote=X]cité[/quote]Un [b]vol[/b] de nuit [img]http://a/1.png[/img] <i>calme</i>')).toBe('Un vol de nuit calme');
		expect(plainExcerpt('[b] [/b]')).toBeNull();
		const long = plainExcerpt('mot '.repeat(100), 30) ?? '';
		expect([...long].length).toBeLessThanOrEqual(30);
		expect(long.endsWith('mot…')).toBe(true);
	});

	it('première image des messages, en http(s) seulement', () => {
		expect(firstImageUrl(['rien', '[img]javascript:x[/img] [img]https://a/1.png[/img] [img]https://a/2.png[/img]'])).toBe(
			'https://a/1.png',
		);
		expect(firstImageUrl(['rien'])).toBeNull();
	});

	it('robots.txt et sitemap.xml', () => {
		const robots = robotsTxt('https://forum.test');
		expect(robots).toContain('Disallow: /admin_');
		expect(robots).toContain('Disallow: /post.php');
		expect(robots).toContain('Sitemap: https://forum.test/sitemap.xml');
		const xml = sitemapXml('https://forum.test', [
			{ path: 'viewtopic.php?id=4&p=2', lastPost: 1_782_800_000 },
			{ path: 'faq.php', lastPost: 0 },
		]);
		expect(xml).toContain('<loc>https://forum.test/viewtopic.php?id=4&amp;p=2</loc><lastmod>2026-06-30</lastmod>');
		expect(xml).toContain('<url><loc>https://forum.test/faq.php</loc></url>');
	});
});

describe('référencement : pages', () => {
	const deps = () =>
		fakeDeps({
			users: [{ viewer: guest, passwordHash: '' }],
			topics: [topic({ id: 10 })],
			posts: new Map([[10, [post(100, { message: 'Bonjour [b]à tous[/b] [img]https://img.test/a.png[/img]' }), post(101)]]]),
		});

	it('robots.txt et sitemap.xml servis', async () => {
		app = await buildApp(deps());
		const robots = await app.inject('/robots.txt');
		expect(robots.headers['content-type']).toContain('text/plain');
		expect(robots.body).toContain('Sitemap: http://forum.test/sitemap.xml');
		const sitemap = await app.inject('/sitemap.xml');
		expect(sitemap.headers['content-type']).toContain('application/xml');
		expect(sitemap.body).toContain('<loc>http://forum.test/viewtopic.php?id=10</loc>');
		expect(sitemap.body).toContain('<loc>http://forum.test/terms.php</loc>');
		expect((await app.inject('/favicon.ico')).statusCode).toBe(301);
	});

	it('discussion : description, canonique absolue, aperçu de partage avec sa première image', async () => {
		app = await buildApp(deps());
		const page = await app.inject('/viewtopic.php?id=10');
		expect(page.body).toContain('<link rel="canonical" href="http://forum.test/viewtopic.php?id=10">');
		expect(page.body).toContain('<meta name="description" content="Bonjour à tous">');
		expect(page.body).toContain('<meta property="og:type" content="article">');
		expect(page.body).toContain('<meta property="og:image" content="https://img.test/a.png">');
	});

	it('accueil : description du forum, image par défaut ; page non indexée sans aperçu', async () => {
		app = await buildApp(deps());
		const index = await app.inject('/index.php');
		expect(index.body).toContain('<meta name="description" content="Le forum de test">');
		expect(index.body).toContain('<meta property="og:image" content="http://forum.test/assets/icons/icon-512.png">');
		const login = await app.inject('/login.php');
		expect(login.body).not.toContain('og:title');
	});
});
