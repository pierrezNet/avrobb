/**
 * Pages d'information modifiables (admin_pages.php) : balisage simple, liens contrôlés, contenu
 * enregistré dans config et affiché par terms.php…, retour au texte par défaut ; administrateurs seulement.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { GroupId } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { toBoardConfig } from '../src/services/boardConfig.ts';
import { formatStaticBody, isSafeLink, parseStaticBody, readStaticPageForm } from '../src/services/staticPageConfig.ts';
import { type FakeData, fakeDeps, group, guest, NOW, sessionCookie, viewer } from './fixtures.ts';

describe('balisage des pages d’information', () => {
	it('rubriques, paragraphes et liens ; aller-retour avec le formulaire', () => {
		const body = 'Avant\n\n## Règles\nLigne un\nsuite\n\nDeux\n[Aide](faq.php)\n[Piège](javascript:alert(1))\n\n## Vide';
		const sections = parseStaticBody(body);
		expect(sections).toEqual([
			{ title: '', paragraphs: ['Avant'] },
			{
				title: 'Règles',
				paragraphs: ['Ligne un suite', 'Deux', '[Piège](javascript:alert(1))'],
				links: [{ label: 'Aide', href: 'faq.php' }],
			},
			{ title: 'Vide', paragraphs: [] },
		]);
		expect(parseStaticBody(formatStaticBody(sections))).toEqual(sections);
	});

	it('liens : pages du forum et http(s) seulement', () => {
		expect(isSafeLink('search.php?action=show_new')).toBe(true);
		expect(isSafeLink('https://www.cnil.fr')).toBe(true);
		expect(isSafeLink('javascript:alert(1)')).toBe(false);
		expect(isSafeLink('//evil.test')).toBe(false);
		expect(isSafeLink('../config.php')).toBe(false);
	});

	it('formulaire : titre obligatoire, au moins une rubrique', () => {
		const read = (values: Record<string, string>) => (name: string) => values[name] ?? '';
		expect(readStaticPageForm(read({ title: ' ', body: '## A' }))).toMatchObject({ kind: 'error', errors: ['title'] });
		expect(readStaticPageForm(read({ title: 'T', body: '' }))).toMatchObject({ kind: 'error', errors: ['body'] });
		expect(readStaticPageForm(read({ title: ' T ', intro: 'I', body: '## A\r\nB' }))).toEqual({
			kind: 'ok',
			title: 'T',
			intro: 'I',
			body: '## A\nB',
		});
	});

	it('contenu enregistré illisible : texte par défaut', () => {
		expect(toBoardConfig(new Map([['o_page_terms', '{pas du json']])).staticPages).toEqual({});
	});
});

const SEED = 'graine-de-test';
const CSRF_SECRET = '6'.repeat(64);
const admin = viewer({ id: 2, username: 'admin', group: group({ id: GroupId.Admin }) });
const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true }) });
const hashes: Record<number, string> = { 2: 'h2', 5: 'h5' };
const cookies = (userId: number): string => `${sessionCookie(userId)}; avrobb_csrf=${CSRF_SECRET}`;

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

function data(): FakeData {
	return {
		users: [{ viewer: guest }, { viewer: admin }, { viewer: mod }],
		topics: [],
		posts: new Map(),
		configValues: new Map(),
	};
}

const send = (server: FastifyInstance, userId: number, fields: Record<string, string>) =>
	server.inject({
		method: 'POST',
		url: '/admin_pages.php',
		headers: { cookie: cookies(userId), 'content-type': 'application/x-www-form-urlencoded' },
		payload: new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, userId), ...fields }).toString(),
	});

describe('admin_pages.php', () => {
	it('liste et formulaire prérempli du texte par défaut ; administrateurs seulement', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		expect((await app.inject({ url: '/admin_pages.php', headers: { cookie: cookies(5) } })).statusCode).toBe(403);
		const list = await app.inject({ url: '/admin_pages.php', headers: { cookie: cookies(2) } });
		expect(list.body).toContain('href="admin_pages.php?page=privacy"');
		expect(list.body).toContain('Texte par défaut');
		const form = await app.inject({ url: '/admin_pages.php?page=terms', headers: { cookie: cookies(2) } });
		expect(form.body).toContain('value="Termes et règles"');
		expect(form.body).toContain('## Respect et courtoisie');
		expect(form.body).not.toContain('name="reset"');
		expect((await app.inject({ url: '/admin_pages.php?page=../x', headers: { cookie: cookies(2) } })).statusCode).toBe(404);
		expect((await send(app, 5, { page: 'terms', title: 'X', body: '## A' })).statusCode).toBe(403);
	});

	it('enregistre (REPLACE), refuse une saisie invalide, revient au texte par défaut', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const invalid = await send(app, 2, { page: 'terms', title: '', body: '## A' });
		expect(invalid.statusCode).toBe(400);
		expect(invalid.body).toContain('Le titre est obligatoire');

		const saved = await send(app, 2, {
			page: 'terms',
			title: 'Charte',
			intro: 'Bienvenue',
			body: '## Règle <1>\nSoyez sympa.\n[Aide](faq.php)',
		});
		expect(saved.headers.location).toBe('admin_pages.php?page=terms&done=saved');
		expect(fake.configLog).toEqual(['replace o_page_terms']);
		const stored = JSON.parse(fake.configValues?.get('o_page_terms') ?? '{}');
		expect(stored).toMatchObject({ title: 'Charte', intro: 'Bienvenue', updatedAt: NOW });

		const reset = await send(app, 2, { page: 'terms', reset: '1' });
		expect(reset.headers.location).toBe('admin_pages.php?page=terms&done=reset');
		expect(fake.configValues?.has('o_page_terms')).toBe(false);
	});

	it('page publique : contenu enregistré, texte échappé, date de mise à jour', async () => {
		const fake = data();
		const value = JSON.stringify({
			title: 'Charte',
			intro: 'Bienvenue',
			body: '## Règle <1>\nSoyez sympa.\n[Aide](faq.php)',
			updatedAt: NOW,
		});
		fake.config = { staticPages: toBoardConfig(new Map([['o_page_terms', value]])).staticPages };
		app = await buildApp(fakeDeps(fake));
		const page = await app.inject('/terms.php');
		expect(page.body).toContain('<h1 class="page-title">Charte</h1>');
		expect(page.body).toContain('<h3 class="forum-row__name">Règle &lt;1&gt;</h3>');
		expect(page.body).toContain('<a href="faq.php">Aide</a>');
		expect(page.body).toContain('Dernière mise à jour : ');
		expect(page.body).not.toContain('Respect et courtoisie');
	});
});
