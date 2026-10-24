/**
 * Session : règles de check_cookie(), check_bans(), update_users_online() et leur application à
 * chaque requête (cookies émis, présence, maintenance, bannissements).
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { GroupId } from '../src/domain/models.ts';
import { type Ban, checkBans } from '../src/services/bans.ts';
import { buildLegacyCookie, cookieMaxAge, forumHmac, renewedExpiry } from '../src/services/legacySession.ts';
import { memberPresenceUpdate, planOnlinePurge } from '../src/services/presence.ts';
import { fakeDeps, fakeOnline, group, guest, NOW, viewer } from './fixtures.ts';

describe('cookie FluxBB', () => {
	it('format de pun_setcookie()', () => {
		expect(buildLegacyCookie(3, 'hash', 1000, 'graine')).toBe(
			`3|${forumHmac('hash', 'graine_password_hash')}|1000|${forumHmac('3|1000', 'graine_cookie_hash')}`,
		);
	});

	it('renouvellement : 14 jours pour « se souvenir de moi », sinon une visite', () => {
		expect(renewedExpiry(NOW + 100_000, NOW, 1800)).toBe(NOW + 1_209_600);
		expect(renewedExpiry(NOW + 1000, NOW, 1800)).toBe(NOW + 1800);
	});

	it('cookie de session quand l’échéance ne dépasse pas la visite (forum_setcookie())', () => {
		expect(cookieMaxAge(NOW + 1800, NOW, 1800)).toBeNull();
		expect(cookieMaxAge(NOW + 1_209_600, NOW, 1800)).toBe(1_209_600);
	});
});

describe('checkBans', () => {
	const ban = (id: number, overrides: Partial<Ban>): Ban => ({
		id,
		username: '',
		ip: '',
		email: '',
		message: '',
		expire: null,
		...overrides,
	});

	it('par pseudo (casse ignorée) ou par adresse, préfixe au point près', () => {
		expect(checkBans([ban(1, { username: 'TESSY' })], 'Tessy', '10.0.0.1', NOW).ban?.id).toBe(1);
		expect(checkBans([ban(2, { ip: '192.168.0 10.1.2.3' })], 'x', '192.168.0.42', NOW).ban?.id).toBe(2);
		expect(checkBans([ban(3, { ip: '192.168.0.5' })], 'x', '192.168.0.50', NOW).ban).toBeNull();
		expect(checkBans([ban(4, { ip: '2001:db8' })], 'x', '2001:db8::1', NOW).ban?.id).toBe(4);
	});

	it('écarte et signale les bannissements échus', () => {
		const result = checkBans(
			[ban(5, { username: 'Tessy', expire: NOW - 1 }), ban(6, { ip: '10.0.0.1', expire: NOW + 60 })],
			'Tessy',
			'10.0.0.1',
			NOW,
		);
		expect(result).toEqual({ ban: expect.objectContaining({ id: 6 }), expiredIds: [5] });
	});
});

describe('présence', () => {
	it('arrivée, visite qui continue, visite expirée non purgée', () => {
		expect(memberPresenceUpdate(null, NOW, 1800)).toEqual({ kind: 'enter' });
		expect(memberPresenceUpdate({ logged: NOW - 100, idle: true }, NOW, 1800)).toEqual({ kind: 'refresh', lastVisit: null });
		expect(memberPresenceUpdate({ logged: NOW - 5000, idle: false }, NOW, 1800)).toEqual({ kind: 'refresh', lastVisit: NOW - 5000 });
	});

	it('update_users_online() : invités partis, fins de visite, membres inactifs', () => {
		const entries = [
			{ userId: 1, ident: '10.0.0.1', logged: NOW - 400, idle: false },
			{ userId: 1, ident: '10.0.0.2', logged: NOW - 10, idle: false },
			{ userId: 3, ident: 'Tessy', logged: NOW - 4000, idle: true },
			{ userId: 5, ident: 'MaxDUO', logged: NOW - 400, idle: false },
			{ userId: 6, ident: 'valdefsx', logged: NOW - 400, idle: true },
		];
		expect(planOnlinePurge(entries, NOW, 300, 1800)).toEqual({
			removeGuests: ['10.0.0.1'],
			endVisits: [{ userId: 3, logged: NOW - 4000 }],
			markIdle: [5],
		});
	});
});

const SEED = 'graine-de-test';
const cookieFor = (userId: number, hash: string, expires = NOW + 3600): string =>
	`punbb_cookie=${buildLegacyCookie(userId, hash, expires, SEED)}`;
const setCookies = (header: string | string[] | undefined): string[] =>
	header === undefined ? [] : Array.isArray(header) ? header : [header];

const tessy = viewer({ lastVisit: NOW - 7200 });
const admin = viewer({ id: 2, username: 'admin', group: group({ id: GroupId.Admin }) });

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

describe('session à chaque requête', () => {
	const base = (overrides = {}) =>
		fakeDeps({
			users: [
				{ viewer: guest, passwordHash: '' },
				{ viewer: tessy, passwordHash: 'hash-tessy', presence: { logged: NOW - 100, idle: true } },
				{ viewer: admin, passwordHash: 'hash-admin' },
			],
			topics: [],
			posts: new Map(),
			...overrides,
		});

	it('membre : cookie renouvelé au format du PHP, présence rafraîchie', async () => {
		const online = fakeOnline();
		app = await buildApp({ ...base(), online });
		// Cookie de visite (échéance avant la fin de la visite) : renouvelé pour une visite, sans Max-Age.
		const res = await app.inject({ url: '/index.php', headers: { cookie: cookieFor(3, 'hash-tessy', NOW + 1000) } });

		const session = setCookies(res.headers['set-cookie']).find((c) => c.startsWith('punbb_cookie='));
		expect(session).toContain(buildLegacyCookie(3, 'hash-tessy', NOW + 1800, SEED));
		expect(session).toContain('HttpOnly');
		expect(session).not.toContain('Max-Age');
		expect(online.log).toEqual(['refresh 3']);
	});

	it('première page d’une visite : entrée dans la liste et cookie de suivi vidé', async () => {
		const online = fakeOnline();
		app = await buildApp({ ...base(), online });
		const res = await app.inject({ url: '/index.php', headers: { cookie: cookieFor(2, 'hash-admin', NOW + 100_000) } });

		expect(online.log).toEqual(['enter 2 admin']);
		expect(setCookies(res.headers['set-cookie']).some((c) => c.startsWith('punbb_cookie_track=;'))).toBe(true);
		expect(setCookies(res.headers['set-cookie']).find((c) => c.startsWith('punbb_cookie='))).toContain('Max-Age=1209600');
	});

	it('cookie falsifié : remplacé par un cookie invité, visiteur traité en invité', async () => {
		const online = fakeOnline();
		app = await buildApp({ ...base(), online });
		const res = await app.inject({ url: '/index.php', headers: { cookie: cookieFor(3, 'mauvais-hash') } });

		expect(setCookies(res.headers['set-cookie']).find((c) => c.startsWith('punbb_cookie='))).toMatch(/^punbb_cookie=1\|/);
		expect(online.log).toEqual(['enter 1 127.0.0.1']);
		expect(res.body).toContain('Vous n&#39;êtes pas identifié(e).');
	});

	it('extern.php ne touche pas à la présence d’un membre (PUN_QUIET_VISIT)', async () => {
		const online = fakeOnline();
		app = await buildApp({ ...base(), online });
		await app.inject({ url: '/extern.php?action=stats', headers: { cookie: cookieFor(3, 'hash-tessy') } });
		expect(online.log).toEqual([]);
	});

	it('maintenance : page 503 pour tous sauf les administrateurs', async () => {
		app = await buildApp(base({ config: { maintenance: true } }));
		const blocked = await app.inject('/index.php');
		expect(blocked.statusCode).toBe(503);
		expect(blocked.body).toContain('Le forum est fermé pour <b>maintenance</b>.');
		expect((await app.inject({ url: '/index.php', headers: { cookie: cookieFor(2, 'hash-admin') } })).statusCode).toBe(200);
	});

	it('bannissement : page 403 avec échéance et motif ; les échus sont supprimés', async () => {
		const online = fakeOnline();
		const deps = {
			...base({
				bans: [
					{ id: 1, username: 'Tessy', ip: '', email: '', message: '', expire: NOW - 10 },
					{ id: 2, username: '', ip: '127.0.0', email: '', message: 'Spam <répété>', expire: NOW + 86_400 * 3 },
				],
			}),
			online,
		};
		app = await buildApp(deps);
		const res = await app.inject({ url: '/viewforum.php?id=1', headers: { cookie: cookieFor(3, 'hash-tessy') } });

		expect(res.statusCode).toBe(403);
		expect(res.body).toContain('Vous êtes banni(e) de ce forum.');
		expect(res.body).toContain('<strong>Spam &lt;répété&gt;</strong>');
		expect(await deps.bans.listBans()).toHaveLength(1);
		expect(online.log).toContain('remove ident Tessy');
		// Les administrateurs ne sont jamais bloqués.
		expect((await app.inject({ url: '/index.php', headers: { cookie: cookieFor(2, 'hash-admin') } })).statusCode).toBe(200);
	});
});
