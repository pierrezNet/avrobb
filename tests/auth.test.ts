/**
 * Connexion par un fournisseur SSO (GET /auth/<fournisseur>, /auth/<fournisseur>/callback) : départ
 * avec state et PKCE, retour vérifié, compte trouvé ou créé (pseudo unique, administrateur initial),
 * session ouverte ; page de connexion ; « me déconnecter de partout ».
 */

import { describe, expect, it } from 'vitest';
import { buildApp, type ForumApp } from '../src/app.ts';
import type { RateLimiter } from '../src/controllers/AuthController.ts';
import { GroupId } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { readSessionCookie } from '../src/services/session.ts';
import { COOKIE_SECRET, type FakeData, fakeDeps, guest, NOW, sessionCookie, viewer } from './fixtures.ts';
import { type InjectResponse, inject } from './inject.ts';

const HOST = 'forum.test';

function data(overrides: Partial<FakeData> = {}): FakeData {
	return {
		users: [{ viewer: guest }, { viewer: viewer({ id: 3, username: 'Tessy' }) }],
		topics: [],
		posts: new Map(),
		oauthIdentities: new Map([
			['code-admin', { providerId: '42', usernames: ['epierrez', 'Emmanuel'], email: 'e@example.test' }],
			['code-tessy', { providerId: '77', usernames: ['tessy', null], email: null }],
		]),
		...overrides,
	};
}

const cookiesOf = (res: InjectResponse): string[] => [res.headers['set-cookie'] ?? []].flat();
const cookieValue = (res: InjectResponse, name: string): string | undefined =>
	cookiesOf(res)
		.find((cookie) => cookie.startsWith(`${name}=`))
		?.split(';')[0]
		?.slice(name.length + 1);

/** Départ vers GitHub : renvoie le cookie d'état et le state de l'adresse d'autorisation. */
async function start(app: ForumApp, path = '/auth/github?return=viewtopic.php%3Fid%3D4') {
	const res = await inject(app, { url: path, headers: { host: HOST } });
	const location = new URL(String(res.headers.location));
	return { res, location, state: location.searchParams.get('state') ?? '', cookie: cookieValue(res, 'avrobb_oauth') ?? '' };
}

function callback(app: ForumApp, query: string, stateCookie: string, remoteAddress = '192.0.2.10') {
	return inject(app, {
		url: `/auth/github/callback?${query}`,
		remoteAddress,
		headers: { host: HOST, cookie: `avrobb_oauth=${stateCookie}` },
	});
}

describe('départ vers le fournisseur', () => {
	it('redirige vers GitHub avec state et PKCE, et pose un cookie d’état limité à /auth/', async () => {
		const app = await buildApp(fakeDeps(data()));
		const { res, location, state, cookie } = await start(app);
		expect(res.statusCode).toBe(302);
		expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize');
		expect(location.searchParams.get('client_id')).toBe('client-github');
		expect(location.searchParams.get('redirect_uri')).toBe('http://forum.test/auth/github/callback');
		expect(location.searchParams.get('code_challenge_method')).toBe('S256');
		expect(location.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
		expect(state).toMatch(/^[\w-]{32}$/);
		expect(cookie).not.toBe('');
		const header = cookiesOf(res).find((c) => c.startsWith('avrobb_oauth='));
		expect(header).toContain('Path=/auth/');
		expect(header).toContain('HttpOnly');
		expect(header).toContain('SameSite=Lax');
		expect(header).toContain('Max-Age=600');
	});

	it('fournisseur non configuré : 404 ; membre déjà connecté : retour à l’index', async () => {
		const app = await buildApp(fakeDeps(data()));
		expect((await inject(app, { url: '/auth/google', headers: { host: HOST } })).statusCode).toBe(404);
		expect((await inject(app, { url: '/auth/google/callback?code=x&state=y', headers: { host: HOST } })).statusCode).toBe(404);
		const logged = await inject(app, { url: '/auth/github', headers: { host: HOST, cookie: sessionCookie(3) } });
		expect(logged.headers.location).toBe('/');
	});
});

describe('retour du fournisseur', () => {
	it('crée le compte (administrateur initial), ouvre la session et revient à la page demandée', async () => {
		const fake = data();
		const app = await buildApp(fakeDeps(fake));
		const { state, cookie } = await start(app);
		const res = await callback(app, `code=code-admin&state=${state}`, cookie);
		expect(res.statusCode).toBe(302);
		expect(res.headers.location).toBe('/sujet/4');
		expect(fake.oauthCalls).toEqual(['github code-admin 43 http://forum.test/auth/github/callback']);
		expect(fake.accountLog).toEqual([`create 4 epierrez groupe ${GroupId.Admin} e@example.test`]);
		expect(readSessionCookie(cookieValue(res, 'avrobb_session'), COOKIE_SECRET, NOW)).toMatchObject({ userId: 4, version: 0 });
		// Le cookie d'état ne sert qu'une fois.
		expect(cookiesOf(res).find((c) => c.startsWith('avrobb_oauth='))).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);

		// Connexion suivante : même compte, rien de créé.
		const again = await start(app);
		const second = await callback(app, `code=code-admin&state=${again.state}`, again.cookie);
		expect(readSessionCookie(cookieValue(second, 'avrobb_session'), COOKIE_SECRET, NOW)?.userId).toBe(4);
		expect(fake.accountLog).toHaveLength(1);
	});

	it('pseudo déjà pris (ou trop ressemblant) : variante numérotée ; groupe par défaut', async () => {
		const fake = data();
		const app = await buildApp(fakeDeps(fake));
		const { state, cookie } = await start(app);
		await callback(app, `code=code-tessy&state=${state}`, cookie);
		expect(fake.accountLog).toEqual([`create 4 tessy 2 groupe ${GroupId.Member} `]);
	});

	it('state absent, différent ou cookie manquant : refusé sans appeler le fournisseur', async () => {
		const fake = data();
		const app = await buildApp(fakeDeps(fake));
		const { state, cookie } = await start(app);
		expect((await callback(app, 'code=code-admin&state=autre', cookie)).statusCode).toBe(400);
		expect((await callback(app, `code=code-admin&state=${state}`, '')).statusCode).toBe(400);
		expect((await callback(app, `state=${state}`, cookie)).statusCode).toBe(400);
		expect(fake.oauthCalls).toBeUndefined();
		expect(fake.accountLog).toBeUndefined();
	});

	it('connexion annulée chez le fournisseur, ou identité refusée', async () => {
		const fake = data();
		const app = await buildApp(fakeDeps(fake));
		const first = await start(app);
		const cancelled = await callback(app, `error=access_denied&state=${first.state}`, first.cookie);
		expect(cancelled.body).toContain('Connexion annulée.');
		const second = await start(app);
		const failed = await callback(app, `code=inconnu&state=${second.state}`, second.cookie);
		expect(failed.statusCode).toBe(502);
		expect(failed.body).toContain('La connexion avec GitHub a échoué');
		expect(cookieValue(failed, 'avrobb_session')).toBeUndefined();
	});

	it('trop de tentatives : 429', async () => {
		const limiter: RateLimiter = { limit: async ({ key }) => ({ success: key !== 'auth:192.0.2.66' }) };
		const app = await buildApp(fakeDeps(data(), { authRateLimiter: limiter }));
		const limited = await inject(app, { url: '/auth/github', remoteAddress: '192.0.2.66', headers: { host: HOST } });
		expect(limited.statusCode).toBe(429);
		expect(limited.headers['retry-after']).toBe('60');
		expect((await inject(app, { url: '/auth/github', headers: { host: HOST } })).statusCode).toBe(302);
	});
});

describe('page de connexion', () => {
	it('bouton GitHub avec la page de retour ; pas de Google non configuré', async () => {
		const app = await buildApp(fakeDeps(data()));
		const page = await inject(app, { url: '/login.php', headers: { host: HOST, referer: 'http://forum.test/viewforum.php?id=2' } });
		expect(page.body).toContain('href="/auth/github?return=%2Fforum%2F2">Se connecter avec GitHub</a>');
		expect(page.body).not.toContain('Google');
		expect(page.body).toContain('href="/confidentialite"');
	});
});

describe('me déconnecter de partout', () => {
	it('incrémente le numéro de session : l’ancien cookie ne connecte plus', async () => {
		const fake = data();
		const app = await buildApp(fakeDeps(fake));
		const csrf = 'c'.repeat(64);
		const cookie = `${sessionCookie(3)}; avrobb_csrf=${csrf}`;
		const before = await inject(app, { url: '/index.php', headers: { host: HOST, cookie } });
		expect(before.body).toContain('Tessy');
		const res = await inject(app, {
			method: 'POST',
			url: '/login.php?action=out_all',
			headers: { host: HOST, cookie, 'content-type': 'application/x-www-form-urlencoded' },
			payload: `csrf_token=${csrfToken(csrf, COOKIE_SECRET, 3)}`,
		});
		expect(res.headers.location).toBe('/');
		expect(fake.accountLog).toEqual(['endAllSessions 3']);
		const after = await inject(app, { url: '/index.php', headers: { host: HOST, cookie } });
		expect(after.body).not.toContain('Connecté(e) sous l&#39;identité');
		expect(cookiesOf(after).some((c) => c.startsWith('avrobb_session=;'))).toBe(true);
	});
});
