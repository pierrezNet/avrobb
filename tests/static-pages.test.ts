/**
 * Pages d'information (terms.php, privacy.php, faq.php) : rubriques en liste comme un forum, sans
 * formulaire, liens dans le pied de page, accessibles en mode maintenance et sans droit de lecture.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { fakeDeps, group, guest } from './fixtures.ts';

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

const deps = (config = {}, readBoard = true) =>
	fakeDeps({
		users: [{ viewer: { ...guest, group: group({ ...guest.group, canReadBoard: readBoard }) } }],
		topics: [],
		posts: new Map(),
		config,
	});

describe('pages d’information', () => {
	it.each([
		['/terms.php', 'Termes et règles', 'Droits d’auteur'],
		['/privacy.php', 'Politique de confidentialité', 'Vos droits'],
		['/faq.php', 'Aide', 'Mentionner un membre'],
	])('%s : rubriques, contact, sans formulaire', async (url, title, section) => {
		app = await buildApp(deps());
		const res = await app.inject(url);
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain(`<h1 class="page-title">${title}</h1>`);
		expect(res.body).toContain(`<h3 class="forum-row__name">${section}</h3>`);
		expect(res.body).toContain('href="mailto:');
		expect(res.body).not.toContain('<textarea');
		expect(res.body).toContain(`<a href="${url.slice(1)}" aria-current="page">`);
	});

	it('pied de page : les trois pages, plus de liste « Atteindre »', async () => {
		app = await buildApp(deps());
		const res = await app.inject('/index.php');
		expect(res.body).toContain('<a href="terms.php">Termes et règles</a>');
		expect(res.body).toContain('<a href="privacy.php">Politique de confidentialité</a>');
		expect(res.body).toContain('<a href="faq.php">Aide</a>');
		expect(res.body).not.toContain('qjump');
	});

	it('lisibles en mode maintenance et sans droit de lecture du forum', async () => {
		app = await buildApp(deps({ maintenance: true }));
		expect((await app.inject('/index.php')).statusCode).toBe(503);
		expect((await app.inject('/privacy.php')).statusCode).toBe(200);
		await app.close();
		app = await buildApp(deps({}, false));
		expect((await app.inject('/terms.php')).statusCode).toBe(200);
	});
});

describe('stats.php', () => {
	it('totaux, dernier inscrit et présents, lien dans le pied de page', async () => {
		app = await buildApp(
			fakeDeps({
				users: [{ viewer: guest }],
				topics: [],
				posts: new Map(),
				online: [
					{ userId: 3, ident: 'Tessy' },
					{ userId: 1, ident: '192.0.2.1' },
				],
			}),
		);
		const res = await app.inject('/stats.php');
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('<h1 class="page-title">Statistiques</h1>');
		expect(res.body).toContain('Nombre total de messages');
		expect(res.body).toContain('Membres en ligne');
		expect(res.body).toContain('<a href="stats.php" aria-current="page">Statistiques</a>');
	});
});
