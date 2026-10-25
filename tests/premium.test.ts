/**
 * Compte Premium (premium.php) : règles d'expiration et de codes, page et activation.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { buildLegacyCookie } from '../src/services/legacySession.ts';
import { codeKind, extendedExpiration, premiumState } from '../src/services/premium.ts';
import { type FakeData, fakeDeps, guest, NOW, viewer } from './fixtures.ts';

const SEED = 'graine-de-test';
const CSRF_SECRET = 'f'.repeat(64);
const cookie = `punbb_cookie=${buildLegacyCookie(3, 'h3', NOW + 3600, SEED)}; punbb_cookie_csrf=${CSRF_SECRET}`;
/** NOW = 2026-07-01 (horodatage des tests). */
const TODAY = new Date(NOW * 1000).toISOString().slice(0, 10);

describe('règles Premium', () => {
	it('état selon la date d’expiration', () => {
		expect(premiumState(null, NOW)).toBe('inactive');
		expect(premiumState('2036-01-01', NOW)).toBe('lifetime');
		expect(premiumState('2099-12-31', NOW)).toBe('active');
		expect(premiumState(TODAY, NOW)).toBe('inactive');
	});

	it('codes de 15 et 365 jours, prolongation à partir de l’expiration en cours', () => {
		expect(codeKind('PV15-ABCD')).toEqual({ table: 'acodes15', days: 15 });
		expect(codeKind('XPV365X')).toEqual({ table: 'acodes365', days: 365 });
		expect(codeKind('INCONNU')).toBeNull();
		expect(extendedExpiration(null, 15, Date.UTC(2026, 6, 1) / 1000)).toBe('2026-07-16');
		expect(extendedExpiration('2026-07-10', 15, Date.UTC(2026, 6, 1) / 1000)).toBe('2026-07-25');
		expect(extendedExpiration('2026-01-01', 365, Date.UTC(2026, 6, 1) / 1000)).toBe('2027-07-01');
		expect(extendedExpiration('2036-01-01', 15, NOW)).toBe('2036-01-01');
	});
});

function data(overrides: Partial<FakeData> = {}): FakeData {
	return {
		users: [
			{ viewer: guest, passwordHash: '' },
			{ viewer: viewer(), passwordHash: 'h3' },
		],
		topics: [],
		posts: new Map(),
		premiumCodes: [{ table: 'acodes15', code: 'PV15-TEST', used: 0 }],
		...overrides,
	};
}

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

function activate(server: FastifyInstance, code: string) {
	const body = new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, 3), code });
	return server.inject({
		method: 'POST',
		url: '/premium.php',
		headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
		payload: body.toString(),
	});
}

describe('premium.php', () => {
	it('invité : identification requise', async () => {
		app = await buildApp(fakeDeps(data()));
		expect((await app.inject('/premium.php')).statusCode).toBe(403);
	});

	it('compte inactif : formulaire de code et boutique', async () => {
		app = await buildApp(fakeDeps(data()));
		const res = await app.inject({ url: '/premium.php', headers: { cookie } });
		expect(res.body).toContain('Votre compte premium est inactif.');
		expect(res.body).toContain('name="code"');
		expect(res.body).toContain('digiseller-buy-standalone');
	});

	it('active un code une seule fois', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const res = await activate(app, ' PV15-TEST ');
		expect(res.headers.location).toBe('premium.php?done=activated');
		const day = new Date((NOW + 15 * 86_400) * 1000).toISOString().slice(0, 10);
		expect(fake.premiumExpirations?.get(3)).toBe(day);
		expect((await app.inject({ url: '/premium.php?done=activated', headers: { cookie } })).body).toContain(
			'Votre compte premium est actif.',
		);

		const again = await activate(app, 'PV15-TEST');
		expect(again.statusCode).toBe(200);
		expect(again.body).toContain('Ce code est invalide ou a déjà été utilisé.');
	});

	it('compte à vie : remerciement, ni code ni boutique', async () => {
		app = await buildApp(fakeDeps(data({ premiumExpirations: new Map([[3, '2036-01-01']]) })));
		const res = await app.inject({ url: '/premium.php', headers: { cookie } });
		expect(res.body).toContain('Votre compte est actif à vie.');
		expect(res.body).not.toContain('name="code"');
		expect(res.body).not.toContain('digiseller');
	});
});
