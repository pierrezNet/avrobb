/**
 * Instance anglaise de l'application (/en/, services/routes.ts) : textes de src/lang/en, liens
 * internes sous /en/ avec des mots anglais, versions des pages (hreflang) et lien vers le français.
 * L'instance reçoit l'adresse française de la page, comme le fait worker.ts.
 */

import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { en, enDateWords } from '../src/lang/en/index.ts';
import { fakeDeps, guest, NOW, post, topic } from './fixtures.ts';
import { inject } from './inject.ts';

const english = () =>
	buildApp({
		...fakeDeps({ users: [{ viewer: guest }], topics: [topic({ id: 4, subject: 'Premier sujet' })], posts: new Map([[4, [post(40)]]]) }),
		page: { locale: 'en', lang: en, dateWords: enDateWords, clock: () => NOW },
	});

describe('interface anglaise', () => {
	it('accueil : textes anglais, liens sous /en/, hreflang et lien vers le français', async () => {
		const res = await inject(await english(), '/');
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('<html lang="en">');
		expect(res.body).toContain('href="/en/privacy"');
		expect(res.body).not.toContain('href="/confidentialite"');
		expect(res.body).toContain('<link rel="alternate" hreflang="fr" href="http://forum.test/">');
		expect(res.body).toContain('<link rel="alternate" hreflang="en" href="http://forum.test/en/">');
		expect(res.body).toContain('<link rel="canonical" href="http://forum.test/en/">');
		expect(res.body).toContain('<a href="/" hreflang="fr" lang="fr">Français</a>');
	});

	it('sujet : liens d’action en /en/…php ; redirection gardée en français (le Worker la traduit)', async () => {
		const app = await english();
		const page = await inject(app, '/sujet/4-premier-sujet');
		expect(page.statusCode).toBe(200);
		expect(page.body).toContain('href="/en/topic/4');
		expect(page.body).toContain('<a href="/sujet/4-premier-sujet" hreflang="fr" lang="fr">Français</a>');
		const legacy = await inject(app, '/viewtopic.php?pid=40');
		expect(legacy.headers.location).toMatch(/^\/sujet\/4/);
	});
});
