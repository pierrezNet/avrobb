/**
 * Connexion et déconnexion (login.php) : connexion de développement, cookie de session signé,
 * CSRF, adresse de retour, déconnexion en POST.
 */

import { describe, expect, it } from 'vitest';
import { buildApp, type ForumApp } from '../src/app.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { safeRedirect } from '../src/services/redirects.ts';
import { readSessionCookie } from '../src/services/session.ts';
import { COOKIE_SECRET, fakeDeps, fakeOnline, guest, NOW, sessionCookie, viewer } from './fixtures.ts';
import { inject } from './inject.ts';

describe('safeRedirect', () => {
	it('ne garde que les pages du forum, sur ce site', () => {
		expect(safeRedirect('http://forum.test/viewtopic.php?pid=12', 'forum.test')).toBe('/message/12#p12');
		expect(safeRedirect('viewforum.php?id=2', 'forum.test')).toBe('/forum/2');
		expect(safeRedirect('https://evil.test/index.php', 'forum.test')).toBe('/');
		expect(safeRedirect('//evil.test/index.php', 'forum.test')).toBe('/');
		expect(safeRedirect('javascript:alert(1)', 'forum.test')).toBe('/');
		expect(safeRedirect('/login.php', 'forum.test')).toBe('/');
	});
});

const HOST = 'forum.test';
const CSRF_SECRET = 'a'.repeat(64);

let app: ForumApp | undefined;

const tessy = viewer({ logged: NOW - 900 });
const users = [{ viewer: guest }, { viewer: tessy, presence: { logged: NOW - 900, idle: false } }];

const postForm = (server: ForumApp, url: string, body: string, cookie: string, remoteAddress = '127.0.0.1') =>
	inject(server, {
		method: 'POST',
		url,
		remoteAddress,
		headers: { host: HOST, cookie, 'content-type': 'application/x-www-form-urlencoded' },
		payload: body,
	});

const sessionFrom = (headers: Record<string, unknown>): string | undefined =>
	[headers['set-cookie']]
		.flat()
		.find((c): c is string => typeof c === 'string' && c.startsWith('avrobb_session='))
		?.split(';')[0]
		?.slice('avrobb_session='.length);

describe('connexion de développement', () => {
	const guestCookie = `avrobb_csrf=${CSRF_SECRET}`;
	const guestToken = csrfToken(CSRF_SECRET, COOKIE_SECRET, 1);

	it('ouvre une session signée sous le nom du membre et renvoie à l’adresse demandée', async () => {
		const online = fakeOnline();
		app = await buildApp({ ...fakeDeps({ users, topics: [], posts: new Map() }), online });

		const res = await postForm(
			app,
			'/login.php?action=in',
			`csrf_token=${guestToken}&req_username=TESSY&redirect_url=viewforum.php%3Fid%3D2`,
			guestCookie,
		);
		expect(res.statusCode).toBe(303);
		expect(res.headers.location).toBe('/forum/2');
		expect(readSessionCookie(sessionFrom(res.headers), COOKIE_SECRET, NOW)?.userId).toBe(3);
		expect(online.log).toContain('remove ident 127.0.0.1');
	});

	it('refuse un pseudo inconnu, un jeton absent, une machine distante ou DEV_LOGIN désactivé', async () => {
		app = await buildApp(fakeDeps({ users, topics: [], posts: new Map() }));
		const unknown = await postForm(app, '/login.php?action=in', `csrf_token=${guestToken}&req_username=Personne`, guestCookie);
		expect(sessionFrom(unknown.headers)).toBeUndefined();
		expect(unknown.body).toContain('Aucun membre ne porte ce nom');

		expect((await postForm(app, '/login.php?action=in', 'req_username=Tessy', guestCookie)).statusCode).toBe(403);

		const remote = await postForm(app, '/login.php?action=in', `csrf_token=${guestToken}&req_username=Tessy`, guestCookie, '203.0.113.7');
		expect(remote.statusCode).toBe(403);
		expect(sessionFrom(remote.headers)).toBeUndefined();

		app = await buildApp({ ...fakeDeps({ users, topics: [], posts: new Map() }), devLogin: false });
		const disabled = await postForm(app, '/login.php?action=in', `csrf_token=${guestToken}&req_username=Tessy`, guestCookie);
		expect(disabled.statusCode).toBe(403);
		const page = await inject(app, { url: '/login.php', headers: { host: HOST } });
		expect(page.body).not.toContain('name="req_username"');
		// Sans JavaScript, les pages de GitHub et Google ne s'affichent pas : le visiteur est prévenu.
		expect(page.body).toContain('<noscript><p class="form__help">JavaScript semble désactivé.');
	});

	it('formulaire accessible en maintenance, avec adresse de retour tirée du Referer', async () => {
		app = await buildApp(fakeDeps({ users: [{ viewer: guest }], topics: [], posts: new Map(), config: { maintenance: true } }));
		const res = await inject(app, { url: '/login.php', headers: { host: HOST, referer: 'http://forum.test/viewforum.php?id=2' } });
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('name="redirect_url" value="/forum/2"');
		expect(res.body).not.toContain('type="password"');
	});
});

describe('session et déconnexion', () => {
	const cookie = `${sessionCookie(3)}; avrobb_csrf=${CSRF_SECRET}`;

	it('membre connecté : renvoi à l’index ; déconnexion en POST avec le jeton CSRF', async () => {
		const online = fakeOnline();
		app = await buildApp({ ...fakeDeps({ users, topics: [], posts: new Map() }), online });

		expect((await inject(app, { url: '/login.php', headers: { cookie } })).headers.location).toBe('/');

		// L'ancien lien GET ne déconnecte plus : aucune écriture en GET.
		const get = await inject(app, { url: '/login.php?action=out', headers: { cookie } });
		expect(get.headers.location).toBe('/');
		expect(online.log).not.toContain('remove 3');

		expect((await postForm(app, '/login.php?action=out', 'csrf_token=faux', cookie)).statusCode).toBe(403);
		expect(online.log).not.toContain('remove 3');

		const out = await postForm(app, '/login.php?action=out', `csrf_token=${csrfToken(CSRF_SECRET, COOKIE_SECRET, 3)}`, cookie);
		expect(out.headers.location).toBe('/');
		expect(online.log.slice(-2)).toEqual(['remove 3', `last_visit 3 ${NOW - 900}`]);
		expect(sessionFrom(out.headers)).toBe('');
	});

	it('cookie falsifié ou échu : visiteur traité en invité, cookie effacé', async () => {
		app = await buildApp(fakeDeps({ users, topics: [], posts: new Map() }));
		for (const bad of [sessionCookie(3).replace('avrobb_session=3.', 'avrobb_session=2.'), sessionCookie(3, NOW - 1)]) {
			const res = await inject(app, { url: '/login.php', headers: { cookie: bad } });
			expect(res.statusCode).toBe(200);
			expect(sessionFrom(res.headers)).toBe('');
		}
	});
});
