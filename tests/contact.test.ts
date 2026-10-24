/**
 * Formulaires de misc.php : e-mail à un membre et signalement d'un message (règles, anti-flood,
 * envoi, droits).
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { floodWait, validateEmail, validateReport } from '../src/services/contact.ts';
import { buildLegacyCookie } from '../src/services/legacySession.ts';
import { boardConfig, type FakeData, fakeDeps, group, guest, NOW, post, topic, viewer } from './fixtures.ts';

const tessy = `punbb_cookie=${buildLegacyCookie(3, 'h', NOW + 3600, 'graine-de-test')}`;

describe('règles des formulaires', () => {
	it('anti-flood : délai restant, sauf envoi daté dans le futur', () => {
		expect(floodWait(null, 60, NOW)).toBeNull();
		expect(floodWait(NOW - 20, 60, NOW)).toBe(40);
		expect(floodWait(NOW - 60, 60, NOW)).toBeNull();
		expect(floodWait(NOW + 100, 60, NOW)).toBeNull();
	});

	it('e-mail : sujet, puis message, puis anti-flood', () => {
		const free = { last: null, interval: 60 };
		expect(validateEmail({ subject: ' ', message: '' }, free, NOW).errors).toEqual([{ kind: 'noSubject' }]);
		expect(validateEmail({ subject: 'S', message: ' ' }, free, NOW).errors).toEqual([{ kind: 'noMessage' }]);
		expect(validateEmail({ subject: 'S', message: 'M' }, { last: NOW - 10, interval: 60 }, NOW).errors).toEqual([
			{ kind: 'flood', interval: 60, wait: 50 },
		]);
		expect(validateEmail({ subject: ' S ', message: ' M ' }, free, NOW)).toEqual({ values: { subject: 'S', message: 'M' }, errors: [] });
	});

	it('signalement : motif requis et limité à 64 Kio', () => {
		const free = { last: null, interval: 60 };
		expect(validateReport('  ', free, NOW).errors).toEqual([{ kind: 'noReason' }]);
		expect(validateReport('é'.repeat(40_000), free, NOW).errors).toEqual([{ kind: 'tooLong' }]);
		expect(validateReport(' Hors\r\nsujet ', free, NOW)).toEqual({ reason: 'Hors\nsujet', errors: [] });
	});
});

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

function data(overrides: Partial<FakeData> = {}): FakeData {
	return {
		users: [
			{ viewer: guest, passwordHash: '' },
			{ viewer: viewer(), passwordHash: 'h' },
		],
		topics: [topic({ id: 10, subject: 'Sujet signalé', forum: { id: 2, name: 'Captures', moderators: new Map() } })],
		posts: new Map([[10, [post(100)]]]),
		recipients: new Map([
			[5, { username: 'MaxDUO', email: 'max@example.test', emailSetting: 1 }],
			[6, { username: 'Discret', email: 'discret@example.test', emailSetting: 2 }],
		]),
		...overrides,
	};
}

async function submit(server: FastifyInstance, url: string, fields: Record<string, string>, headers: Record<string, string> = {}) {
	const page = await server.inject({ url, headers: { cookie: tessy, host: 'forum.test', ...headers } });
	const csrf =
		[page.headers['set-cookie']]
			.flat()
			.find((c) => c?.startsWith('punbb_cookie_csrf='))
			?.split(';')[0] ?? '';
	const token = /name="csrf_token" value="([0-9a-f]+)"/.exec(page.body)?.[1] ?? '';
	const redirect = /name="redirect_url" value="([^"]*)"/.exec(page.body)?.[1]?.replaceAll('&amp;', '&');
	return server.inject({
		method: 'POST',
		url,
		headers: { cookie: `${tessy}; ${csrf}`, 'content-type': 'application/x-www-form-urlencoded', host: headers.host ?? 'forum.test' },
		payload: new URLSearchParams({
			csrf_token: token,
			form_sent: '1',
			...(redirect !== undefined ? { redirect_url: redirect } : {}),
			...fields,
		}).toString(),
	});
}

describe('misc.php?email=', () => {
	it('envoie l’e-mail avec réponse à l’expéditeur et revient à la page d’origine', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const res = await submit(
			app,
			'/misc.php?email=5',
			{ req_subject: 'Bonjour', req_message: 'Un message' },
			{ referer: 'http://forum.test/viewtopic.php?pid=100' },
		);
		expect(res.statusCode).toBe(303);
		expect(res.headers.location).toBe('viewtopic.php?pid=100#p100');
		expect(fake.sentMails).toEqual([
			expect.objectContaining({
				to: 'max@example.test',
				subject: 'Sujet form_email',
				replyTo: { email: 'tessy@example.com', name: 'Tessy' },
			}),
		]);
		expect(fake.contactLog).toEqual([`email 3 ${NOW}`]);
	});

	it('réaffiche le formulaire en cas d’erreur ou d’anti-flood', async () => {
		const fake = data({ senderLimits: { lastEmailSent: NOW - 10, emailFlood: 60, lastReportSent: null, reportFlood: 60 } });
		app = await buildApp(fakeDeps(fake));
		const res = await submit(app, '/misc.php?email=5', { req_subject: 'Bonjour', req_message: 'Un message' });
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('L&#39;intervalle d&#39;envoi consécutif d&#39;e-mails est de 60 secondes');
		expect(res.body).toContain('value="Bonjour"');
		expect(fake.sentMails).toBeUndefined();
	});

	it('droits : invité, groupe sans e-mail, formulaire désactivé (sauf modérateur), destinataire inconnu', async () => {
		app = await buildApp(fakeDeps(data()));
		const status = async (url: string, cookie = tessy) => (await app?.inject({ url, headers: { cookie } }))?.statusCode;
		expect(await status('/misc.php?email=5', '')).toBe(403);
		expect(await status('/misc.php?email=6')).toBe(403);
		expect(await status('/misc.php?email=1')).toBe(404);
		expect(await status('/misc.php?email=99')).toBe(404);
		await app.close();
		app = await buildApp(
			fakeDeps(
				data({
					users: [
						{ viewer: guest, passwordHash: '' },
						{ viewer: viewer({ group: group({ canSendEmail: false }) }), passwordHash: 'h' },
					],
				}),
			),
		);
		expect((await app.inject({ url: '/misc.php?email=5', headers: { cookie: tessy } })).statusCode).toBe(403);
		await app.close();
		app = await buildApp(
			fakeDeps(
				data({
					users: [
						{ viewer: guest, passwordHash: '' },
						{ viewer: viewer({ group: group({ isModerator: true }) }), passwordHash: 'h' },
					],
				}),
			),
		);
		expect((await app.inject({ url: '/misc.php?email=6', headers: { cookie: tessy } })).statusCode).toBe(200);
	});
});

describe('misc.php?report=', () => {
	it('enregistre le signalement et revient au forum', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const page = await app.inject({ url: '/misc.php?report=100', headers: { cookie: tessy } });
		expect(page.body).toContain('Sujet signalé');
		const res = await submit(app, '/misc.php?report=100', { req_reason: 'Hors sujet' });
		expect(res.headers.location).toBe('viewforum.php?id=2');
		expect(fake.createdReports).toEqual([
			{
				target: { postId: 100, topicId: 10, subject: 'Sujet signalé', forumId: 2, forumName: 'Captures' },
				reportedBy: 3,
				created: NOW,
				message: 'Hors sujet',
			},
		]);
		expect(fake.contactLog).toEqual([`report 3 ${NOW}`]);
	});

	it('par e-mail seulement selon o_report_method', async () => {
		const fake = data({ config: { ...boardConfig, reportsByBoard: false, reportsByEmail: true } });
		app = await buildApp(fakeDeps(fake));
		await submit(app, '/misc.php?report=100', { req_reason: 'Doublon' });
		expect(fake.createdReports).toBeUndefined();
		expect(fake.sentMails).toEqual([expect.objectContaining({ to: 'liste@forum.test', subject: 'Sujet new_report' })]);
	});

	it('refuse un invité, un message inconnu et un motif vide', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		expect((await app.inject('/misc.php?report=100')).statusCode).toBe(403);
		expect((await app.inject({ url: '/misc.php?report=999', headers: { cookie: tessy } })).statusCode).toBe(404);
		const res = await submit(app, '/misc.php?report=100', { req_reason: ' ' });
		expect(res.body).toContain('Vous devez indiquer un motif.');
		expect(fake.createdReports).toBeUndefined();
	});
});
