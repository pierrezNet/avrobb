/**
 * Messagerie privée (mod APMS) : règles d'envoi (services/privateMessages.ts) et pages pms_*.php
 * de bout en bout avec la messagerie en mémoire (tests/fakePrivateMessages.ts).
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { GroupId, type PrivateRecipient } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { markParticipantDeleted, parseParticipants, parseUsernames, validateSend } from '../src/services/privateMessages.ts';
import { pmData } from './fakePrivateMessages.ts';
import { type FakeData, fakeDeps, group, guest, NOW, sessionCookie, viewer } from './fixtures.ts';

const SEED = 'graine-de-test';
const CSRF_SECRET = 'b'.repeat(64);

function recipient(overrides: Partial<PrivateRecipient> = {}): PrivateRecipient {
	return {
		id: 5,
		username: 'MaxDUO',
		email: 'max@example.test',
		groupId: GroupId.Member,
		usesPrivateMessages: true,
		groupCanUsePrivateMessages: true,
		privateMessageLimit: 0,
		privateMessageCount: 0,
		notifyPrivateMessages: false,
		notifyPrivateMessagesFull: false,
		...overrides,
	};
}

describe('règles de la messagerie', () => {
	it('participants, suppression marquée élément par élément, pseudos saisis', () => {
		expect(parseParticipants('Tessy, Max Deleted', '3, 5')).toEqual([
			{ id: 3, username: 'Tessy', deleted: false },
			{ id: 5, username: 'Max', deleted: true },
		]);
		expect(markParticipantDeleted('Max, MaxDUO', 'Max')).toBe('Max Deleted, MaxDUO');
		expect(parseUsernames(' MaxDUO ,, Tessy,MaxDUO')).toEqual(['MaxDUO', 'Tessy']);
	});

	const context = {
		sender: { id: 3, username: 'Tessy', isModerator: false, privateMessageLimit: 20, privateMessageCount: 0 },
		lastPost: null,
		postFlood: 30,
		now: NOW,
		maxReceivers: 3,
		editing: false,
		bbcode: true,
		subjectAllCaps: false,
		messageAllCaps: false,
		preparse: { quoteDepth: 3, makeLinks: false, allowLinks: true, indentSpaces: 4, baseUrl: 'http://forum.test' },
	};
	const tessy = recipient({ id: 3, username: 'Tessy' });
	const input = { usernames: ['MaxDUO'], recipients: [recipient(), tessy], subject: 'Vol', message: '[B]Salut[/B]', preview: false };

	it("retient les destinataires et l'expéditeur, nettoie le BBCode", () => {
		const result = validateSend(input, context);
		expect(result.errors).toEqual([]);
		expect(result.recipients.map((r) => r.username)).toEqual(['MaxDUO', 'Tessy']);
		expect(result.message).toBe('[b]Salut[/b]');
	});

	it('erreurs dans l’ordre du PHP : flood, boîte pleine, destinataires, sujet, message', () => {
		const result = validateSend(
			{
				usernames: ['Inconnu', 'MaxDUO', 'Plein'],
				recipients: [
					recipient({ usesPrivateMessages: false }),
					tessy,
					recipient({ id: 8, username: 'Plein', privateMessageLimit: 5, privateMessageCount: 5 }),
				],
				subject: '',
				message: '',
				preview: false,
			},
			{ ...context, lastPost: NOW - 5, sender: { ...context.sender, privateMessageCount: 20 } },
		);
		expect(result.errors.map((e) => e.kind)).toEqual([
			'flood',
			'senderFull',
			'tooManyReceivers',
			'noUser',
			'userDisabled',
			'receiverFull',
			'noSubject',
			'noMessage',
		]);
	});

	it('une modification ne contrôle ni destinataires ni flood', () => {
		expect(validateSend({ ...input, subject: null, usernames: [] }, { ...context, editing: true, lastPost: NOW }).errors).toEqual([]);
		expect(validateSend({ ...input, subject: 'TOUT EN CAPITALES' }, context).subject).toBe('Tout En Capitales');
	});
});

// ——— Pages ———

const tessy = viewer({ privateMessageCount: 0 });
const max = viewer({ id: 5, username: 'MaxDUO' });
const val = viewer({ id: 6, username: 'valdefsx' });
const mod = viewer({ id: 2, username: 'admin', group: group({ id: GroupId.Admin }) });

function data(overrides: Partial<FakeData> = {}): FakeData {
	return {
		users: [{ viewer: guest }, { viewer: tessy }, { viewer: max }, { viewer: val }, { viewer: mod }],
		topics: [],
		posts: new Map(),
		config: { privateMessagesEnabled: true },
		pm: pmData({
			members: [
				recipient({ id: 3, username: 'Tessy', email: 'tessy@example.test' }),
				recipient(),
				recipient({ id: 6, username: 'valdefsx', email: 'val@example.test', notifyPrivateMessages: true }),
				recipient({ id: 2, username: 'admin', groupId: GroupId.Admin }),
			],
		}),
		...overrides,
	};
}

const cookies = (userId: number): string => `${sessionCookie(userId)}; avrobb_csrf=${CSRF_SECRET}`;

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

async function start(fake: FakeData): Promise<FastifyInstance> {
	app = await buildApp(fakeDeps(fake));
	return app;
}

const get = (server: FastifyInstance, userId: number, url: string) => server.inject({ url, headers: { cookie: cookies(userId) } });

function post(server: FastifyInstance, userId: number, url: string, fields: Record<string, string | string[]>) {
	const body = new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, userId) });
	for (const [name, value] of Object.entries(fields)) for (const item of [value].flat()) body.append(name, item);
	return server.inject({
		method: 'POST',
		url,
		headers: { cookie: cookies(userId), 'content-type': 'application/x-www-form-urlencoded' },
		payload: body.toString(),
	});
}

/** Tessy écrit à MaxDUO et valdefsx ; renvoie la conversation. */
async function startConversation(server: FastifyInstance, fake: FakeData) {
	const res = await post(server, 3, '/pms_send.php', {
		form_sent: '1',
		p_username: 'MaxDUO, valdefsx',
		req_subject: 'Vol de groupe',
		req_message: 'On décolle à 21 h ?',
	});
	expect(res.statusCode).toBe(303);
	return fake.pm?.rows.find((row) => row.ownerId === 5 && row.isHead);
}

describe('accès à la messagerie', () => {
	it('refusée aux invités et quand la messagerie est désactivée', async () => {
		const server = await start(data());
		expect((await server.inject('/pms_inbox.php')).statusCode).toBe(403);
		await server.close();
		const off = await start(data({ config: { privateMessagesEnabled: false } }));
		expect((await get(off, 3, '/pms_send.php')).statusCode).toBe(403);
	});
});

describe('pms_send.php et pms_inbox.php', () => {
	it('crée la conversation chez chaque participant, compte num_pms et prévient par e-mail', async () => {
		const fake = data({ config: { privateMessagesEnabled: true, privateMessageNotification: true } });
		app = await buildApp(
			fakeDeps(fake, { mailTemplates: { load: async (name) => ({ subject: `Sujet ${name}`, body: '<sender> : <pm_url>' }) } }),
		);
		const server = app;
		const head = await startConversation(server, fake);

		expect(fake.pm?.rows.filter((row) => row.isHead).map((row) => [row.ownerId, row.showed])).toEqual([
			[5, false],
			[6, false],
			[3, true],
		]);
		expect(head?.receiver).toBe('MaxDUO, valdefsx, Tessy');
		expect(fake.pm?.members.map((m) => m.privateMessageCount)).toEqual([1, 1, 1, 0]);
		// Seul valdefsx a demandé l'alerte.
		expect(fake.sentMails?.map((mail) => mail.to)).toEqual(['val@example.test']);
		expect(fake.sentMails?.[0]).toMatchObject({
			subject: 'Sujet new_pm',
			text: `Tessy : http://forum.test/pms_view.php?tid=${head?.sharedId}&mid=${fake.pm?.rows.find((r) => r.ownerId === 6)?.id}&box=inbox`,
		});

		const inbox = await get(server, 5, '/pms_inbox.php');
		expect(inbox.body).toContain('<strong>Vol de groupe</strong>');
		expect(inbox.body).toContain('href="profile.php?id=3">Tessy</a>');
	});

	it('réaffiche le formulaire avec les erreurs, et prévisualise', async () => {
		const fake = data();
		const server = await start(fake);
		const res = await post(server, 3, '/pms_send.php', {
			form_sent: '1',
			p_username: 'MaxDUO, Fantôme',
			req_subject: 'X',
			req_message: 'Y',
		});
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('Il n&#39;y a pas de membre avec le nom d&#39;utilisateur « Fantôme ».');
		expect(fake.pm?.rows).toEqual([]);

		const preview = await post(server, 3, '/pms_send.php', {
			form_sent: '1',
			p_username: 'valdefsx',
			req_subject: 'X',
			req_message: '[b]Gras[/b]',
			preview: '1',
		});
		expect(preview.body).toContain('<strong>Gras</strong>');
	});

	it('préremplit les destinataires depuis un profil', async () => {
		const fake = data();
		const server = await start(fake);
		expect((await get(server, 3, '/pms_send.php?uid=5-6')).body).toContain('value="MaxDUO, valdefsx"');
		expect((await get(server, 3, '/pms_send.php?uid=999')).statusCode).toBe(404);
	});

	it('marque comme lu ou non lu, et supprime après confirmation', async () => {
		const fake = data();
		const server = await start(fake);
		const head = await startConversation(server, fake);
		const shared = String(head?.sharedId);

		expect((await post(server, 5, '/pms_inbox.php', { action: 'markread', selected: shared })).headers.location).toBe(
			'pms_inbox.php?done=read',
		);
		expect(head?.showed).toBe(true);
		expect((await post(server, 5, '/pms_inbox.php', { action: 'markread' })).body).toContain('Vous devez sélectionner des messages');

		const confirm = await post(server, 5, '/pms_inbox.php', { action: 'delete_multiple', selected: shared });
		expect(confirm.body).toContain(`name="messages" value="${shared}"`);
		await post(server, 5, '/pms_inbox.php', { action: 'delete_multiple', messages: shared, delete_multiple_comply: '1' });
		expect(fake.pm?.rows.some((row) => row.ownerId === 5)).toBe(false);
		expect(fake.pm?.members.find((m) => m.id === 5)?.privateMessageCount).toBe(0);
		// Les autres voient MaxDUO comme ayant quitté la conversation.
		expect((await get(server, 3, '/pms_inbox.php')).body).toContain('MaxDUO (supprimé)');
	});
});

describe('pms_view.php', () => {
	it('affiche la conversation, la marque lue, refuse aux non-participants', async () => {
		const fake = data();
		const server = await start(fake);
		const head = await startConversation(server, fake);
		const url = `/pms_view.php?tid=${head?.sharedId}&mid=${head?.id}`;

		const res = await get(server, 5, url);
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('On décolle à 21 h ?');
		expect(res.body).toContain('Vol de groupe avec MaxDUO, valdefsx, Tessy');
		expect(head?.showed).toBe(true);
		expect((await get(server, 2, url)).statusCode).toBe(404);
	});

	it('une réponse va aux participants qui détiennent encore la conversation', async () => {
		const fake = data();
		const server = await start(fake);
		const head = await startConversation(server, fake);
		await post(server, 6, '/pms_inbox.php', { action: 'delete_multiple', messages: String(head?.sharedId), delete_multiple_comply: '1' });

		const res = await post(server, 5, `/pms_send.php?reply=${head?.sharedId}`, { form_sent: '1', req_message: 'Oui, à 21 h.' });
		expect(res.statusCode).toBe(303);
		expect(res.headers.location).toContain(`pms_view.php?tid=${head?.sharedId}&mid=${head?.id}&pid=`);
		const replies = fake.pm?.rows.filter((row) => !row.isHead) ?? [];
		expect(replies.map((row) => row.ownerId).sort()).toEqual([3, 5]);
		expect(fake.pm?.rows.find((row) => row.ownerId === 3 && row.isHead)?.showed).toBe(false);

		// Répondre à une conversation qu'on ne détient pas est refusé.
		expect((await post(server, 6, `/pms_send.php?reply=${head?.sharedId}`, { req_message: 'x' })).statusCode).toBe(404);
	});

	it('citation, modification par l’auteur seulement, suppression d’un message', async () => {
		const fake = data();
		const server = await start(fake);
		const head = await startConversation(server, fake);
		const tessyCopy = fake.pm?.rows.find((row) => row.ownerId === 3);
		const maxCopy = fake.pm?.rows.find((row) => row.ownerId === 5);

		expect((await get(server, 5, `/pms_send.php?reply=${head?.sharedId}&quote=${maxCopy?.id}`)).body).toContain(
			'[quote=Tessy]On décolle à 21 h ?[/quote]',
		);
		expect((await get(server, 5, `/pms_send.php?edit=${maxCopy?.id}`)).statusCode).toBe(404);

		const edited = await post(server, 3, `/pms_send.php?edit=${tessyCopy?.id}`, { req_message: 'On décolle à 22 h.' });
		expect(edited.statusCode).toBe(303);
		expect(fake.pm?.rows.filter((row) => row.message === 'On décolle à 22 h.')).toHaveLength(3);

		const confirm = await get(server, 5, `/pms_view.php?action=delete&mid=${maxCopy?.id}&tid=${head?.sharedId}`);
		expect(confirm.body).toContain('Discussion démarrée par Tessy');
		expect(confirm.body).not.toContain('delete_all');
		await post(server, 5, `/pms_view.php?action=delete&mid=${maxCopy?.id}&tid=${head?.sharedId}`, { delete_comply: '1' });
		expect(fake.pm?.rows.some((row) => row.ownerId === 5)).toBe(false);
	});
});
