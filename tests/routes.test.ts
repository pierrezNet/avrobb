/**
 * Adresses propres (services/routes.ts) : slug, traduction des cibles logiques, retour sûr après
 * connexion, et pages servies sous leurs nouvelles adresses (les anciennes restent servies).
 */

import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { safeRedirect } from '../src/services/redirects.ts';
import { absoluteUrl, forumPath, idFromSegment, memberPath, postPath, publicPath, slugify, topicPath } from '../src/services/routes.ts';
import { fakeDeps, guest, NOW, post, topic, viewer } from './fixtures.ts';
import { inject } from './inject.ts';

describe('slug', () => {
	it('minuscules ASCII, accents et ponctuation retirés, longueur bornée sans couper un mot', () => {
		expect(slugify('[AvroBB] Premier sujet sur D1 !')).toBe('avrobb-premier-sujet-sur-d1');
		expect(slugify('Phraséologie aéronautique — Œuvre & cætera')).toBe('phraseologie-aeronautique-oeuvre-caetera');
		expect(slugify('« »')).toBe('');
		const long = slugify('Un sujet vraiment très long qui dépasse largement la limite fixée pour une adresse lisible');
		expect(long.length).toBeLessThanOrEqual(60);
		expect(long.endsWith('-')).toBe(false);
		expect('un-sujet-vraiment-tres-long-qui-depasse-largement-la-limite'.startsWith(long)).toBe(true);
	});

	it('adresses à numéro, slug facultatif', () => {
		expect(topicPath(4, 'Premier sujet')).toBe('/sujet/4-premier-sujet');
		expect(topicPath(4, null, 3)).toBe('/sujet/4/page/3');
		expect(forumPath(2, 'AvroBB', 2)).toBe('/forum/2-avrobb/page/2');
		expect(forumPath(2, '???')).toBe('/forum/2');
		expect(postPath(12)).toBe('/message/12#p12');
		expect(memberPath(3)).toBe('/membre/3');
		expect(idFromSegment('4-premier-sujet')).toBe(4);
		expect(idFromSegment('4')).toBe(4);
		for (const bad of ['', 'abc', '4-Majuscule', '4_x', '-4', undefined]) expect(idFromSegment(bad), String(bad)).toBeNull();
	});
});

describe('publicPath', () => {
	it('pages publiques : adresses propres, paramètres et ancre gardés', () => {
		expect(publicPath('index.php')).toBe('/');
		expect(publicPath('viewforum.php?id=2&p=3')).toBe('/forum/2/page/3');
		expect(publicPath('viewtopic.php?id=4&action=new')).toBe('/sujet/4?action=new');
		expect(publicPath('viewtopic.php?pid=12#p12')).toBe('/message/12#p12');
		expect(publicPath('viewtopic.php?pid=12')).toBe('/message/12#p12');
		expect(publicPath('profile.php?id=3')).toBe('/membre/3');
		expect(publicPath('search.php?action=show_new')).toBe('/recherche?action=show_new');
		expect(publicPath('gallery.php?info=pick&embed=1#gallery-upload')).toBe('/galerie?info=pick&embed=1#gallery-upload');
		expect(publicPath('help.php')).toBe('/aide');
		expect(publicPath('login.php?action=out')).toBe('/connexion?action=out');
	});

	it('pages d’action : même adresse, rendue absolue ; adresses absolues inchangées', () => {
		expect(publicPath('profile.php?section=essentials&id=3')).toBe('/profile.php?section=essentials&id=3');
		expect(publicPath('post.php?tid=4')).toBe('/post.php?tid=4');
		expect(publicPath('viewtopic.php?id=abc')).toBe('/viewtopic.php?id=abc');
		expect(publicPath('/sujet/4')).toBe('/sujet/4');
		expect(publicPath('https://github.com/x')).toBe('https://github.com/x');
		expect(publicPath('mailto:a@example.test')).toBe('mailto:a@example.test');
		expect(publicPath('#p12')).toBe('#p12');
		expect(absoluteUrl('https://avrobb.example', 'viewtopic.php?pid=5')).toBe('https://avrobb.example/message/5#p5');
	});
});

describe('safeRedirect', () => {
	it('pages de ce site seulement, jamais la connexion ; anciennes adresses traduites', () => {
		expect(safeRedirect('http://forum.test/sujet/4-premier?p=2#p9', 'forum.test')).toBe('/sujet/4-premier?p=2#p9');
		expect(safeRedirect('viewforum.php?id=2', 'forum.test')).toBe('/forum/2');
		expect(safeRedirect('/membres', 'forum.test')).toBe('/membres');
		for (const bad of [
			'https://evil.test/sujet/4',
			'//evil.test/',
			'/connexion',
			'/auth/github/callback',
			'/login.php',
			'javascript:alert(1)',
		])
			expect(safeRedirect(bad, 'forum.test'), bad).toBe('/');
	});
});

describe('pages servies sous leurs adresses propres', () => {
	const deps = () =>
		fakeDeps({
			users: [{ viewer: guest }, { viewer: viewer() }],
			topics: [topic({ id: 10, subject: 'Vol de nuit' })],
			posts: new Map([[10, [post(100, { posted: NOW - 600 }), post(101)]]]),
		});

	it('discussion, page, message, et ancienne adresse toujours servie', async () => {
		const app = await buildApp(deps());
		const page = await inject(app, '/sujet/10-vol-de-nuit');
		expect(page.statusCode).toBe(200);
		expect(page.body).toContain('<link rel="canonical" href="http://forum.test/sujet/10-vol-de-nuit">');
		// Slug faux ou absent : la page est servie, l'adresse canonique la corrige.
		expect((await inject(app, '/sujet/10')).statusCode).toBe(200);
		expect((await inject(app, '/sujet/10-autre-chose')).statusCode).toBe(200);
		// Un message renvoie à la page de sa discussion, à son ancre.
		const message = await inject(app, '/message/101');
		expect(message.statusCode).toBe(302);
		expect(message.headers.location).toBe('/sujet/10#p101');
		expect((await inject(app, '/viewtopic.php?id=10')).statusCode).toBe(200);
	});

	it('adresses mal formées : page introuvable', async () => {
		const app = await buildApp(deps());
		for (const url of ['/sujet/abc', '/sujet/10/page/x', '/forum/-2', '/membre/3/x', '/message/'])
			expect((await inject(app, url)).statusCode, url).toBe(404);
	});

	it('pages d’information et listes', async () => {
		const app = await buildApp(deps());
		for (const url of [
			'/aide',
			'/conditions',
			'/confidentialite',
			'/faq',
			'/statistiques',
			'/membres',
			'/galerie',
			'/recherche',
			'/connexion',
		])
			expect((await inject(app, url)).statusCode, url).toBe(200);
	});

	it('les liens de l’en-tête et du pied mènent aux adresses propres', async () => {
		const app = await buildApp(deps());
		const page = await inject(app, '/');
		expect(page.body).toContain('href="/membres"');
		expect(page.body).toContain('href="/connexion"');
		expect(page.body).toContain('href="/confidentialite"');
		expect(page.body).not.toMatch(/href="(?:index|viewtopic|viewforum|userlist|search|help|privacy|terms)\.php/);
	});
});
