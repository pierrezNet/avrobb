/**
 * Pages publiques cachables (lot 7) : un invité ne reçoit aucun cookie hors des pages de
 * formulaire, les pages sont à revalider par le navigateur, et les cookies prennent le préfixe
 * __Host- (ou __Secure-) en HTTPS.
 */

import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { cookieName } from '../src/config.ts';
import type { AppRequest } from '../src/http/context.ts';
import { type RateLimiter, rateLimitKey } from '../src/http/rateLimit.ts';
import { canWriteWhileBanned } from '../src/services/permissions.ts';
import { fakeDeps, guest, NOW, post, topic, viewer } from './fixtures.ts';
import { inject } from './inject.ts';

const deps = () =>
	fakeDeps({
		users: [{ viewer: guest }, { viewer: viewer() }],
		topics: [topic({ id: 10, subject: 'Vol de nuit' })],
		posts: new Map([[10, [post(100, { posted: NOW - 600 })]]]),
	});

describe('pages publiques sans cookie', () => {
	it('aucun cookie posé à un invité sur les pages publiques ; revalidation demandée au navigateur', async () => {
		const app = await buildApp(deps());
		for (const url of ['/', '/sujet/10-vol-de-nuit', '/membres', '/galerie', '/aide', '/faq', '/recherche', '/statistiques']) {
			const res = await inject(app, url);
			expect(res.statusCode, url).toBe(200);
			expect(res.headers['set-cookie'], url).toBeUndefined();
			expect(res.headers['cache-control'], url).toBe('private, no-cache');
		}
	});

	it('page de connexion : cookie CSRF posé pour le formulaire', async () => {
		const app = await buildApp(deps());
		const res = await inject(app, '/connexion');
		expect([res.headers['set-cookie']].flat().some((c) => String(c).startsWith('avrobb_csrf='))).toBe(true);
	});

	it('invité qui a déjà le cookie CSRF : jeton calculé, rien de reposé', async () => {
		const app = await buildApp(deps());
		const res = await inject(app, { url: '/', headers: { cookie: `avrobb_csrf=${'a'.repeat(64)}` } });
		expect(res.headers['set-cookie']).toBeUndefined();
	});
});

describe('noms des cookies', () => {
	const config = (secure: boolean) => ({ name: 'avrobb', secret: 's'.repeat(32), secure });

	it('__Host- en HTTPS (chemin /), __Secure- pour un cookie limité à un chemin ; sans préfixe en HTTP', () => {
		expect(cookieName(config(true), 'session')).toBe('__Host-avrobb_session');
		expect(cookieName(config(true), 'oauth', false)).toBe('__Secure-avrobb_oauth');
		expect(cookieName(config(false), 'session')).toBe('avrobb_session');
	});

	it('session posée avec Secure sous son nom __Host-', async () => {
		const app = await buildApp({ ...deps(), cookie: config(true) });
		const res = await inject(app, '/connexion');
		expect(
			[res.headers['set-cookie']]
				.flat()
				.some((c) => /^__Host-avrobb_csrf=[0-9a-f]{64}; Path=\/; HttpOnly; Secure; SameSite=Lax$/.test(String(c))),
		).toBe(true);
	});
});

describe('membre banni', () => {
	it('peut se déconnecter, par l’ancienne adresse comme par la nouvelle', () => {
		expect(canWriteWhileBanned('/connexion', {})).toBe(true);
		expect(canWriteWhileBanned('/login.php', {})).toBe(true);
		expect(canWriteWhileBanned('/post.php', {})).toBe(false);
	});
});

describe('limitation de débit', () => {
	it('écritures par membre, recherche par adresse pour un invité ; 429 au-delà', async () => {
		const keys: string[] = [];
		const limiter = (blocked: string): RateLimiter => ({
			limit: async ({ key }) => {
				keys.push(key);
				return { success: key !== blocked };
			},
		});
		const app = await buildApp({
			...deps(),
			searchRateLimiter: limiter('search:ip:192.0.2.66'),
			writeRateLimiter: limiter('write:user:3'),
		});
		expect((await inject(app, { url: '/recherche', remoteAddress: '192.0.2.10' })).statusCode).toBe(200);
		const blocked = await inject(app, { url: '/recherche', remoteAddress: '192.0.2.66' });
		expect(blocked.statusCode).toBe(429);
		expect(blocked.headers['retry-after']).toBe('60');
		expect(blocked.body).toContain('Trop de demandes');
		expect(keys).toEqual(['search:ip:192.0.2.10', 'search:ip:192.0.2.66']);
		expect(rateLimitKey('write', { viewer: viewer({ id: 3 }), ip: '192.0.2.1' } as AppRequest)).toBe('write:user:3');
	});
});
