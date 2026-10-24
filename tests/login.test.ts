/**
 * Connexion et déconnexion (login.php) : mots de passe FluxBB, cookie, CSRF, adresse de retour.
 */

import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { GroupId } from '../src/domain/models.ts';
import { buildLegacyCookie, logoutToken, punHash } from '../src/services/legacySession.ts';
import { checkPassword } from '../src/services/passwords.ts';
import { safeRedirect } from '../src/services/redirects.ts';
import { fakeDeps, fakeOnline, group, guest, NOW, viewer } from './fixtures.ts';

describe('checkPassword', () => {
	it('SHA-1 de FluxBB, MD5 hérité de 1.2 à remplacer', () => {
		expect(checkPassword('secret', punHash('secret'))).toEqual({ valid: true, upgradeTo: null });
		expect(checkPassword('autre', punHash('secret')).valid).toBe(false);
		const md5 = createHash('md5').update('secret').digest('hex');
		expect(checkPassword('secret', md5)).toEqual({ valid: true, upgradeTo: punHash('secret') });
		expect(checkPassword('', '').valid).toBe(false);
	});
});

describe('safeRedirect', () => {
	it('ne garde que les pages du forum, sur ce site', () => {
		expect(safeRedirect('http://forum.test/viewtopic.php?pid=12', 'forum.test')).toBe('viewtopic.php?pid=12#p12');
		expect(safeRedirect('viewforum.php?id=2', 'forum.test')).toBe('viewforum.php?id=2');
		expect(safeRedirect('https://evil.test/index.php', 'forum.test')).toBe('index.php');
		expect(safeRedirect('//evil.test/index.php', 'forum.test')).toBe('index.php');
		expect(safeRedirect('javascript:alert(1)', 'forum.test')).toBe('index.php');
		expect(safeRedirect('/login.php', 'forum.test')).toBe('index.php');
	});
});

const SEED = 'graine-de-test';
const HOST = 'forum.test';

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

/** Récupère le cookie CSRF et le jeton du formulaire de connexion. */
async function loginForm(server: FastifyInstance): Promise<{ cookie: string; token: string }> {
	const page = await server.inject({ url: '/login.php', headers: { host: HOST } });
	const csrf = [page.headers['set-cookie']].flat().find((c) => c?.startsWith('punbb_cookie_csrf='));
	const token = /name="csrf_token" value="([0-9a-f]+)"/.exec(page.body)?.[1] ?? '';
	return { cookie: (csrf ?? '').split(';')[0] ?? '', token };
}

const post = (server: FastifyInstance, body: string, cookie: string) =>
	server.inject({
		method: 'POST',
		url: '/login.php?action=in',
		headers: { host: HOST, cookie, 'content-type': 'application/x-www-form-urlencoded' },
		payload: body,
	});

describe('POST /login.php?action=in', () => {
	const tessy = viewer();
	const pending = viewer({ id: 7, username: 'Nouveau', group: group({ id: 0 }) });
	const deps = () =>
		fakeDeps({
			users: [
				{ viewer: guest, passwordHash: '' },
				{ viewer: tessy, passwordHash: punHash('motdepasse') },
				{ viewer: pending, passwordHash: createHash('md5').update('ancien').digest('hex') },
			],
			topics: [],
			posts: new Map(),
		});

	it('connecte : cookie FluxBB (14 jours avec « se souvenir de moi »), retour vers la page d’origine', async () => {
		const online = fakeOnline();
		app = await buildApp({ ...deps(), online });
		const { cookie, token } = await loginForm(app);
		const res = await post(
			app,
			`csrf_token=${token}&req_username=TESSY&req_password=motdepasse&save_pass=1&redirect_url=viewtopic.php%3Fpid%3D12`,
			cookie,
		);

		expect(res.statusCode).toBe(303);
		expect(res.headers.location).toBe('viewtopic.php?pid=12#p12');
		const session = [res.headers['set-cookie']].flat().find((c) => c?.startsWith('punbb_cookie='));
		expect(session).toContain(buildLegacyCookie(3, punHash('motdepasse'), NOW + 1_209_600, SEED));
		expect(online.log).toContain('remove ident 127.0.0.1');
	});

	it('refuse un mot de passe faux, un formulaire sans jeton CSRF ou venu d’un autre site', async () => {
		app = await buildApp(deps());
		const { cookie, token } = await loginForm(app);

		const wrong = await post(app, `csrf_token=${token}&req_username=Tessy&req_password=faux`, cookie);
		expect(wrong.body).toContain('Nom d&#39;utilisateur et/ou mot de passe incorrect.');
		expect([wrong.headers['set-cookie']].flat().some((c) => c?.startsWith('punbb_cookie=3'))).toBe(false);

		expect((await post(app, 'req_username=Tessy&req_password=motdepasse', cookie)).statusCode).toBe(403);
		expect((await post(app, `csrf_token=${token}&req_username=Tessy&req_password=motdepasse`, '')).statusCode).toBe(403);
		const foreign = await app.inject({
			method: 'POST',
			url: '/login.php?action=in',
			headers: { host: HOST, origin: 'https://evil.test', cookie, 'content-type': 'application/x-www-form-urlencoded' },
			payload: `csrf_token=${token}&req_username=Tessy&req_password=motdepasse`,
		});
		expect(foreign.statusCode).toBe(403);
	});

	it('remplace un hash MD5 et valide un compte en attente à sa première connexion', async () => {
		const d = deps();
		app = await buildApp(d);
		const { cookie, token } = await loginForm(app);
		const res = await post(app, `csrf_token=${token}&req_username=Nouveau&req_password=ancien`, cookie);

		expect(res.statusCode).toBe(303);
		expect(await d.credentials.findCredentials('Nouveau')).toMatchObject({ passwordHash: punHash('ancien'), groupId: GroupId.Member });
	});
});

describe('GET /login.php', () => {
	const tessy = viewer({ logged: NOW - 900 });
	const cookie = `punbb_cookie=${buildLegacyCookie(3, 'h', NOW + 3600, SEED)}`;

	it('membre connecté : renvoi à l’index ; déconnexion avec le jeton de l’en-tête', async () => {
		const online = fakeOnline();
		app = await buildApp({
			...fakeDeps({
				users: [
					{ viewer: guest, passwordHash: '' },
					{ viewer: tessy, passwordHash: 'h', presence: { logged: NOW - 900, idle: false } },
				],
				topics: [],
				posts: new Map(),
			}),
			online,
		});

		expect((await app.inject({ url: '/login.php', headers: { cookie } })).headers.location).toBe('index.php');

		const bad = await app.inject({ url: '/login.php?action=out&id=3&csrf_token=faux', headers: { cookie } });
		expect(bad.headers.location).toBe('index.php');
		expect(online.log).not.toContain('remove 3');

		const out = await app.inject({ url: `/login.php?action=out&id=3&csrf_token=${logoutToken(3, '127.0.0.1')}`, headers: { cookie } });
		expect(out.headers.location).toBe('index.php');
		expect(online.log.slice(-2)).toEqual(['remove 3', `last_visit 3 ${NOW - 900}`]);
		expect([out.headers['set-cookie']].flat().find((c) => c?.startsWith('punbb_cookie='))).toMatch(/^punbb_cookie=1\|/);
	});

	it('formulaire accessible en maintenance, avec adresse de retour tirée du Referer', async () => {
		app = await buildApp(
			fakeDeps({ users: [{ viewer: guest, passwordHash: '' }], topics: [], posts: new Map(), config: { maintenance: true } }),
		);
		const res = await app.inject({ url: '/login.php', headers: { host: HOST, referer: 'http://forum.test/viewforum.php?id=2' } });
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('name="redirect_url" value="viewforum.php?id=2"');
		expect(res.body).toContain('autocomplete="current-password"');
	});
});
