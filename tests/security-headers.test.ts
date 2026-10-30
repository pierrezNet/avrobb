/**
 * En-têtes de sécurité (http/securityHeaders.ts) : CSP sans script en ligne, vidéos autorisées,
 * formulaires vers l'installation PHP, HSTS seulement en HTTPS ; présents sur toutes les réponses.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { contentSecurityPolicy, securityHeaders } from '../src/http/securityHeaders.ts';
import { fakeDeps, guest } from './fixtures.ts';

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

describe('en-têtes de sécurité', () => {
	it('politique de contenu', () => {
		const csp = contentSecurityPolicy('http://php.test/forum');
		expect(csp).toContain("script-src 'self';");
		expect(csp).not.toMatch(/script-src[^;]*unsafe/);
		expect(csp).toContain("frame-src 'self' https://www.youtube-nocookie.com https://www.dailymotion.com;");
		expect(csp).toContain("form-action 'self' http://php.test;");
		expect(csp).toContain("frame-ancestors 'self'");
		expect(contentSecurityPolicy('')).toContain("form-action 'self';");
	});

	it('HSTS seulement en HTTPS', () => {
		expect(securityHeaders('', false)).not.toHaveProperty('Strict-Transport-Security');
		expect(securityHeaders('', true)['Strict-Transport-Security']).toContain('max-age=');
	});

	it('sur les pages et les fichiers statiques', async () => {
		app = await buildApp(fakeDeps({ users: [{ viewer: guest }], topics: [], posts: new Map() }));
		for (const url of ['/index.php', '/assets/css/base.css', '/page-inconnue.php']) {
			const res = await app.inject(url);
			expect(res.headers['content-security-policy']).toContain("default-src 'self'");
			expect(res.headers['x-content-type-options']).toBe('nosniff');
			expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
		}
	});
});
