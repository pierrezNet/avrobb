/**
 * Pages d'information (terms.php, privacy.php, faq.php) : rubriques en liste comme un forum, sans
 * formulaire, liens dans le pied de page, accessibles en mode maintenance et sans droit de lecture.
 */

import { describe, expect, it } from 'vitest';
import { buildApp, type ForumApp } from '../src/app.ts';
import { fakeDeps, group, guest } from './fixtures.ts';
import { inject } from './inject.ts';

let app: ForumApp | undefined;

const deps = (config = {}, readBoard = true) =>
	fakeDeps({
		users: [{ viewer: { ...guest, group: group({ ...guest.group, canReadBoard: readBoard }) } }],
		topics: [],
		posts: new Map(),
		config,
	});

describe('pages d’information', () => {
	it.each([
		['/conditions', 'Termes et règles', 'Droits d’auteur'],
		['/confidentialite', 'Politique de confidentialité', 'Vos droits'],
		['/faq', 'Aide', 'Mentionner un membre'],
	])('%s : rubriques, contact, sans formulaire', async (url, title, section) => {
		app = await buildApp(deps());
		const res = await inject(app, url);
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain(`<h1 class="page-title">${title}</h1>`);
		expect(res.body).toContain(`<h3 class="forum-row__name">${section}</h3>`);
		expect(res.body).toContain('href="mailto:');
		expect(res.body).not.toContain('<textarea');
		expect(res.body).toContain(`<a href="${url}" aria-current="page">`);
	});

	it('confidentialité : le délégué à la protection des données, même sans adresse d’administrateur', async () => {
		for (const adminEmail of ['admin@forum.test', '']) {
			app = await buildApp(deps({ adminEmail }));
			const privacy = (await inject(app, '/confidentialite')).body;
			expect(privacy).toContain('<a href="mailto:dpo@pierrez.net">dpo@pierrez.net</a>');
			expect(privacy).not.toContain('mailto:admin@forum.test');
			// Les autres pages gardent l'adresse de l'administrateur, et n'ont pas de contact sans elle
			const terms = (await inject(app, '/conditions')).body;
			if (adminEmail === '') expect(terms).not.toContain('href="mailto:');
			else expect(terms).toContain('mailto:admin@forum.test');
		}
	});

	it('pied de page : les trois pages, plus de liste « Atteindre »', async () => {
		app = await buildApp(deps());
		const res = await inject(app, '/index.php');
		expect(res.body).toContain('<a href="/conditions">Termes et règles</a>');
		expect(res.body).toContain('<a href="/confidentialite">Politique de confidentialité</a>');
		expect(res.body).toContain('<a href="/faq">Aide</a>');
		expect(res.body).not.toContain('qjump');
	});

	it('lisibles en mode maintenance et sans droit de lecture du forum', async () => {
		app = await buildApp(deps({ maintenance: true }));
		expect((await inject(app, '/index.php')).statusCode).toBe(503);
		expect((await inject(app, '/privacy.php')).statusCode).toBe(200);
		app = await buildApp(deps({}, false));
		expect((await inject(app, '/terms.php')).statusCode).toBe(200);
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
		const res = await inject(app, '/stats.php');
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('<h1 class="page-title">Statistiques</h1>');
		expect(res.body).toContain('Nombre total de messages');
		expect(res.body).toContain('Membres en ligne');
		expect(res.body).toContain('<a href="/statistiques" aria-current="page">Statistiques</a>');
	});
});
