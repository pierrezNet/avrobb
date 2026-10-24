/**
 * Inscription (register.php) : check_username(), validation, création, e-mails, connexion.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import type { BoardConfig } from '../src/domain/models.ts';
import type { Ban } from '../src/services/bans.ts';
import { buildCensor } from '../src/services/censor.ts';
import { buildLegacyCookie, punHash } from '../src/services/legacySession.ts';
import { checkUsername, isBannedEmail, readRegistration } from '../src/services/registration.ts';
import { boardConfig, type FakeData, fakeDeps, guest, NOW, viewer } from './fixtures.ts';

const ban = (overrides: Partial<Ban>): Ban => ({ id: 1, username: '', ip: '', email: '', message: '', expire: null, ...overrides });

describe('checkUsername (check_username())', () => {
	it('règles de forme, dans l’ordre du PHP', () => {
		expect(checkUsername('a', 'Invité', [], null)).toEqual(['tooShort']);
		expect(checkUsername('x'.repeat(26), 'Invité', [], null)).toEqual(['tooLong']);
		expect(checkUsername('INVITÉ', 'Invité', [], null)).toEqual(['guest']);
		expect(checkUsername('Guest', 'Invité', [], null)).toEqual(['guest']);
		expect(checkUsername('pilote 10.0.0.1', 'Invité', [], null)).toEqual(['ip']);
		expect(checkUsername(`a[b]'c"`, 'Invité', [], null)).toEqual(['reservedChars']);
		expect(checkUsername('[b]gras[/b]', 'Invité', [], null)).toEqual(['bbcode']);
		expect(checkUsername('Pilote42', 'Invité', [], null)).toEqual([]);
	});

	it('censure et pseudo banni', () => {
		const censor = buildCensor([{ searchFor: 'zut', replaceWith: '***' }]);
		expect(checkUsername('zut', 'Invité', [ban({ username: 'ZUT' })], censor)).toEqual(['censored', 'banned']);
	});

	it('adresse bannie exacte ou par domaine', () => {
		expect(isBannedEmail('spam@example.test', [ban({ email: 'example.test' })])).toBe(true);
		expect(isBannedEmail('a@b.test', [ban({ email: 'a@b.test' })])).toBe(true);
		expect(isBannedEmail('a@b.test', [ban({ email: 'c@b.test' })])).toBe(false);
	});
});

describe('readRegistration', () => {
	const input = {
		username: '  Pilote   42 ',
		password1: 'secret1',
		password2: 'secret1',
		email1: ' Pilote@Example.TEST ',
		email2: '',
		timezone: '5.5',
		dst: true,
		emailSetting: '2',
	};
	const options = { verifyEmail: false, defaultEmailSetting: 1, generatedPassword: 'ALEATOIRE' };

	it('normalise et valide', () => {
		expect(readRegistration(input, options)).toEqual({
			values: { username: 'Pilote 42', email: 'pilote@example.test', password: 'secret1', timezone: 5.5, dst: true, emailSetting: 2 },
			errors: [],
		});
		expect(
			readRegistration({ ...input, password1: 'court', password2: 'court', timezone: '99', emailSetting: '7' }, options),
		).toMatchObject({
			values: { timezone: 0, emailSetting: 1 },
			errors: ['passTooShort'],
		});
		expect(readRegistration({ ...input, password2: 'autre' }, options).errors).toEqual(['passNotMatch']);
	});

	it('adresse à vérifier : mot de passe tiré au sort, adresses confirmées', () => {
		const verify = { ...options, verifyEmail: true };
		expect(readRegistration({ ...input, email2: 'pilote@example.test' }, verify)).toMatchObject({
			values: { password: 'ALEATOIRE' },
			errors: [],
		});
		expect(readRegistration({ ...input, email2: 'autre@example.test' }, verify).errors).toEqual(['emailNotMatch']);
	});
});

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

async function submit(server: FastifyInstance, fields: Record<string, string>) {
	const page = await server.inject('/register.php?agree=1');
	const csrf =
		[page.headers['set-cookie']]
			.flat()
			.find((c) => c?.startsWith('punbb_cookie_csrf='))
			?.split(';')[0] ?? '';
	const token = /name="csrf_token" value="([0-9a-f]+)"/.exec(page.body)?.[1] ?? '';
	return server.inject({
		method: 'POST',
		url: '/register.php?action=register',
		headers: { cookie: csrf, 'content-type': 'application/x-www-form-urlencoded' },
		payload: new URLSearchParams({ csrf_token: token, form_sent: '1', ...fields }).toString(),
	});
}

const valid = {
	req_user: 'Pilote42',
	req_password1: 'secret1',
	req_password2: 'secret1',
	req_email1: 'pilote@example.test',
	timezone: '1',
	email_setting: '1',
};

describe('register.php', () => {
	const data = (config: Partial<BoardConfig> = {}): FakeData => ({
		users: [
			{ viewer: guest, passwordHash: '' },
			{ viewer: viewer(), passwordHash: 'h' },
		],
		topics: [],
		posts: new Map(),
		config,
		accounts: [{ id: 3, username: 'Tessy', email: 'tessy@example.test', lastEmailSent: null }],
	});

	it('conditions d’utilisation avant le formulaire quand elles sont activées', async () => {
		app = await buildApp(fakeDeps(data({ rules: true })));
		const rules = await app.inject('/register.php');
		expect(rules.body).toContain('<p>Soyez <em>courtois</em>.</p>');
		expect(rules.body).toContain('name="agree"');
		expect((await app.inject('/register.php?cancel=1')).headers.location).toBe('index.php');
		expect((await app.inject('/register.php?agree=1')).body).toContain('name="req_user"');
	});

	it('crée le compte, invalide le cache des statistiques et connecte le membre', async () => {
		const d = data({ registration: { ...boardConfig.registration, report: true } });
		app = await buildApp(fakeDeps(d));
		const res = await submit(app, valid);

		expect(res.statusCode).toBe(303);
		expect(d.createdUsers?.[0]).toMatchObject({
			username: 'Pilote42',
			groupId: 4,
			passwordHash: punHash('secret1'),
			timezone: 1,
			ip: '127.0.0.1',
		});
		expect([res.headers['set-cookie']].flat().find((c) => c?.startsWith('punbb_cookie='))).toContain(
			buildLegacyCookie(101, punHash('secret1'), NOW + 1800, 'graine-de-test'),
		);
		expect(d.sentMails?.map((m) => [m.to, m.subject])).toEqual([['liste@forum.test', 'Sujet new_user']]);
	});

	it('réaffiche le formulaire avec les erreurs (sans les mots de passe)', async () => {
		const d = data();
		app = await buildApp(fakeDeps(d));
		const res = await submit(app, { ...valid, req_user: 'TESSY', req_email1: 'tessy@example.test', req_password2: 'autre' });

		expect(res.body).toContain('Erreurs d&#39;inscription');
		expect(res.body).toContain('Il existe déjà une personne inscrite avec ce nom d&#39;utilisateur. Tessy.');
		expect(res.body).toContain('Les mots de passe ne coïncident pas.');
		expect(res.body).toContain('Cette adresse électronique est déjà utilisée.');
		expect(res.body).toContain('value="TESSY"');
		expect(res.body).not.toContain('secret1');
		expect(d.createdUsers ?? []).toEqual([]);
	});

	it('vérification par e-mail : compte non validé, mot de passe envoyé, pas de connexion', async () => {
		const d = data({ registration: { ...boardConfig.registration, verify: true } });
		app = await buildApp(fakeDeps(d));
		const res = await submit(app, { req_user: 'Pilote42', req_email1: 'pilote@example.test', req_email2: 'pilote@example.test' });

		expect(res.body).toContain('Votre mot de passe a été envoyé');
		expect(d.createdUsers?.[0]).toMatchObject({ groupId: 0 });
		expect(d.sentMails?.[0]?.to).toBe('pilote@example.test');
		expect([res.headers['set-cookie']].flat().some((c) => c?.startsWith('punbb_cookie=101'))).toBe(false);
	});

	it('refus : inscriptions fermées, inscription récente depuis la même adresse', async () => {
		app = await buildApp(fakeDeps(data({ registrationsAllowed: false })));
		expect((await app.inject('/register.php')).body).toContain('Ces forums n&#39;acceptent pas de nouveaux utilisateurs.');
		await app.close();

		app = await buildApp(fakeDeps({ ...data(), recentRegistrationIps: ['127.0.0.1'] }));
		expect((await submit(app, valid)).statusCode).toBe(429);
	});
});
