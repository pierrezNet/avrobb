/**
 * Mot de passe oublié : règles d'include/email.php et login.php?action=forget.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { punHash } from '../src/services/legacySession.ts';
import { fillTemplate, isValidEmail, parseMailTemplate, randomPassword } from '../src/services/mail.ts';
import { type FakeData, fakeDeps, guest, NOW } from './fixtures.ts';

describe('services e-mail', () => {
	it('is_valid_email()', () => {
		expect(isValidEmail('tessy@pilote-virtuel.com')).toBe(true);
		expect(isValidEmail('"a b"@example.org')).toBe(true);
		expect(isValidEmail('pas une adresse')).toBe(false);
		expect(isValidEmail('a@b')).toBe(false);
		expect(isValidEmail(`${'a'.repeat(75)}@b.org`)).toBe(false);
	});

	it('modèles .tpl : sujet sur la première ligne, balises remplacées', () => {
		const tpl = parseMailTemplate('Subject: Demande de mot de passe\r\n\r\nBonjour <username>,\r\n<inconnue>');
		expect(tpl).toEqual({ subject: 'Demande de mot de passe', body: 'Bonjour <username>,\n<inconnue>' });
		expect(fillTemplate(tpl.body, { username: 'Tessy' })).toBe('Bonjour Tessy,\n<inconnue>');
	});

	it('mots de passe aléatoires sans « + » ni « / »', () => {
		const pass = randomPassword(8);
		expect(pass).toMatch(/^[a-zA-Z0-9]{8}$/);
		expect(new Set(Array.from({ length: 20 }, () => randomPassword(8))).size).toBe(20);
	});
});

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

async function submit(server: FastifyInstance, email: string) {
	const page = await server.inject('/login.php?action=forget');
	const csrf =
		[page.headers['set-cookie']]
			.flat()
			.find((c) => c?.startsWith('punbb_cookie_csrf='))
			?.split(';')[0] ?? '';
	const token = /name="csrf_token" value="([0-9a-f]+)"/.exec(page.body)?.[1] ?? '';
	return server.inject({
		method: 'POST',
		url: '/login.php?action=forget_2',
		headers: { cookie: csrf, 'content-type': 'application/x-www-form-urlencoded' },
		payload: `csrf_token=${token}&form_sent=1&req_email=${encodeURIComponent(email)}`,
	});
}

describe('login.php?action=forget', () => {
	const data = (): FakeData => ({
		users: [{ viewer: guest, passwordHash: '' }],
		topics: [],
		posts: new Map(),
		accounts: [
			{ id: 3, username: 'Tessy', email: 'tessy@example.test', lastEmailSent: null },
			{ id: 5, username: 'MaxDUO', email: 'max@example.test', lastEmailSent: NOW - 600 },
		],
	});

	it('envoie un nouveau mot de passe et le lien d’activation du PHP', async () => {
		const d = data();
		app = await buildApp(fakeDeps(d));
		const res = await submit(app, ' TESSY@example.test ');

		expect(res.body).toContain('Un e-mail contenant des instructions pour modifier votre mot de passe vient d&#39;être envoyé');
		const pending = d.pendingPasswords?.[0];
		expect(pending).toMatchObject({ userId: 3, now: NOW });
		const mail = d.sentMails?.[0];
		expect(mail?.to).toBe('tessy@example.test');
		expect(mail?.text).toContain(`http://forum.test/profile.php?id=3&action=change_pass&key=${pending?.key}`);
		const password = /mot de passe (\w+),/.exec(mail?.text ?? '')?.[1] ?? '';
		expect(punHash(password)).toBe(pending?.passwordHash);
	});

	it('erreurs : adresse invalide ou inconnue, demande répétée dans l’heure', async () => {
		const d = data();
		app = await buildApp(fakeDeps(d));
		expect((await submit(app, 'invalide')).body).toContain('L&#39;adresse électronique que vous avez saisie est invalide.');
		expect((await submit(app, 'personne@example.test')).body).toContain('personne@example.test');
		const flood = await submit(app, 'max@example.test');
		expect(flood.statusCode).toBe(429);
		expect(flood.body).toContain('patienter 50 minutes');
		expect(d.sentMails ?? []).toEqual([]);
	});
});
