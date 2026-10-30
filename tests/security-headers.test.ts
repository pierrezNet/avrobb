/**
 * En-têtes de sécurité (http/securityHeaders.ts) : CSP sans script en ligne, vidéos autorisées,
 * formulaires vers le forum seulement, HSTS seulement en HTTPS ; présents sur toutes les réponses.
 */

import { describe, expect, it } from 'vitest';
import { buildApp, type ForumApp } from '../src/app.ts';
import { contentSecurityPolicy, securityHeaders } from '../src/http/securityHeaders.ts';
import { fakeDeps, guest } from './fixtures.ts';
import { inject } from './inject.ts';

let app: ForumApp | undefined;

describe('en-têtes de sécurité', () => {
	it('politique de contenu', () => {
		const csp = contentSecurityPolicy();
		expect(csp).toContain("script-src 'self';");
		expect(csp).not.toMatch(/script-src[^;]*unsafe/);
		expect(csp).toContain("frame-src 'self' https://www.youtube-nocookie.com https://www.dailymotion.com;");
		expect(csp).toContain("form-action 'self';");
		expect(csp).toContain("frame-ancestors 'self'");
	});

	it('HSTS seulement en HTTPS', () => {
		expect(securityHeaders(false)).not.toHaveProperty('Strict-Transport-Security');
		expect(securityHeaders(true)['Strict-Transport-Security']).toContain('max-age=');
	});

	it('sur les pages et les fichiers statiques', async () => {
		app = await buildApp(fakeDeps({ users: [{ viewer: guest }], topics: [], posts: new Map() }));
		for (const url of ['/index.php', '/assets/css/base.css', '/page-inconnue.php']) {
			const res = await inject(app, url);
			expect(res.headers['content-security-policy']).toContain("default-src 'self'");
			expect(res.headers['x-content-type-options']).toBe('nosniff');
			expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
		}
	});
});
