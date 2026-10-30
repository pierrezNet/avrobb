/**
 * Rédaction (post.php) : règles de validation et de citation, puis la page de bout en bout
 * (droits, prévisualisation, erreurs, enregistrement, notifications, CSRF).
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import type { ForumInfo, PostingTarget } from '../src/domain/models.ts';
import { buildCensor } from '../src/services/censor.ts';
import { canPostIn } from '../src/services/permissions.ts';
import { type PostContext, type PostForm, promotionGroup, quoteText, subscriptionChange, validatePost } from '../src/services/posting.ts';
import { DEFAULT_SUBJECT_TAGS } from '../src/services/subjectTagConfig.ts';
import { type FakeData, fakeDeps, group, guest, NOW, post, sessionCookie, topic, viewer } from './fixtures.ts';

const form = (overrides: Partial<PostForm> = {}): PostForm => ({
	subject: null,
	message: 'Bonjour à tous',
	username: '',
	email: '',
	hideSmilies: false,
	subscribe: false,
	stickTopic: false,
	preview: false,
	...overrides,
});

const context = (overrides: Partial<PostContext> = {}): PostContext => ({
	viewer: viewer(),
	now: NOW,
	isAnyModerator: false,
	isForumModerator: false,
	config: {
		bbcode: true,
		subjectAllCaps: false,
		messageAllCaps: false,
		forceGuestEmail: true,
		allowBannedEmail: false,
		subjectTags: DEFAULT_SUBJECT_TAGS,
	},
	preparse: { quoteDepth: 3, makeLinks: true, indentSpaces: 4, baseUrl: 'http://forum.test' },
	censor: null,
	bans: [],
	similarUsername: null,
	guestLabel: 'Invité',
	...overrides,
});

const kinds = (result: { errors: { kind: string }[] }): string[] => result.errors.map((error) => error.kind);

describe('validatePost (post.php)', () => {
	it('pré-traite le message et garde le texte saisi pour le formulaire', () => {
		const result = validatePost(form({ message: '  [B]gras[/B] www.a.fr\r\n' }), context());
		expect(result.errors).toEqual([]);
		expect(result.message).toBe('[b]gras[/b] [url=http://www.a.fr]www.a.fr[/url]');
		expect(result.originalMessage).toBe('[B]gras[/B] www.a.fr');
		expect(result.username).toBe('Tessy');
		expect(result.email).toBe('tessy@example.com');
	});

	it('anti-flood, sauf en prévisualisation', () => {
		const recent = context({ viewer: viewer({ lastPost: NOW - 10 }) });
		expect(validatePost(form(), recent).errors).toEqual([{ kind: 'flood', interval: 30, wait: 20 }]);
		expect(validatePost(form({ preview: true }), recent).errors).toEqual([]);
	});

	it('sujet : balises inventées et doublons retirés ; sujet réduit à des balises refusé', () => {
		expect(validatePost(form({ subject: '[BETA][MSFS][msfs] Vol' }), context()).subject).toBe('[MSFS] Vol');
		expect(kinds(validatePost(form({ subject: '[BETA] [CI34]' }), context()))).toEqual(['noSubject']);
	});

	it('sujet : vide, censuré, trop long, en capitales (sauf modérateurs)', () => {
		expect(kinds(validatePost(form({ subject: '  ' }), context()))).toEqual(['noSubject']);
		const censor = buildCensor([{ searchFor: 'zut', replaceWith: '' }]);
		expect(kinds(validatePost(form({ subject: 'zut' }), context({ censor })))).toEqual(['noSubjectAfterCensoring']);
		expect(kinds(validatePost(form({ subject: 'é'.repeat(71) }), context()))).toEqual(['tooLongSubject']);
		expect(validatePost(form({ subject: 'é'.repeat(70) }), context()).errors).toEqual([]);
		expect(kinds(validatePost(form({ subject: 'AU SECOURS' }), context()))).toEqual(['allCapsSubject']);
		expect(validatePost(form({ subject: 'AU SECOURS' }), context({ isAnyModerator: true })).errors).toEqual([]);
	});

	it('message en capitales, vide, ou BBCode invalide (sans vérifier les balises après une autre erreur)', () => {
		expect(kinds(validatePost(form({ message: 'URGENT !' }), context()))).toEqual(['allCapsMessage']);
		expect(kinds(validatePost(form({ message: ' [b] [/b] ' }), context()))).toEqual(['bbcode']);
		expect(kinds(validatePost(form({ message: '' }), context()))).toEqual(['noMessage']);
		expect(validatePost(form({ message: '[b]x' }), context()).errors).toEqual([
			{ kind: 'bbcode', error: { kind: 'noClosingTag', tag: 'b' } },
		]);
		expect(kinds(validatePost(form({ subject: '', message: '[b]x' }), context()))).toEqual(['noSubject']);
	});

	it('invité : pseudo (forme, pris, banni) et e-mail', () => {
		const guestContext = context({
			viewer: guest,
			similarUsername: 'Tessy',
			bans: [{ id: 1, username: 'tessy', ip: '', email: 'spam.test', message: '', expire: null }],
		});
		const result = validatePost(form({ username: ' tessy ', email: 'Bot@SPAM.test' }), guestContext);
		expect(result.errors).toEqual([
			{ kind: 'usernameDupe', existing: 'Tessy' },
			{ kind: 'username', error: 'banned' },
			{ kind: 'bannedEmail' },
		]);
		expect(result.email).toBe('bot@spam.test');
		expect(result.bannedEmail).toBe(true);
		expect(kinds(validatePost(form({ username: 'Pilote', email: 'pas-une-adresse' }), context({ viewer: guest })))).toEqual([
			'invalidEmail',
		]);
	});

	it('n’épingle que pour un modérateur du forum', () => {
		expect(validatePost(form({ stickTopic: true }), context()).stickTopic).toBe(false);
		expect(validatePost(form({ stickTopic: true }), context({ isForumModerator: true })).stickTopic).toBe(true);
	});
});

describe('citation (post.php?qid=…)', () => {
	const options = { bbcode: true, indentSpaces: 4, censor: null, wrote: (author: string) => `${author} a écrit :` };

	it('retire les images (hors [code]) et protège un auteur à crochets', () => {
		expect(quoteText('Tessy', 'vu [img]http://a.fr/i.png[/img] [code][img]http://b.fr/j.png[/img][/code]', options)).toBe(
			'[quote=Tessy]vu http://a.fr/i.png [code][img]http://b.fr/j.png[/img][/code][/quote]\n',
		);
		expect(quoteText('[PV] Max', 'x', options)).toBe("[quote='[PV] Max']x[/quote]\n");
		expect(quoteText("[PV] l'as", 'x', options)).toBe('[quote="[PV] l\'as"]x[/quote]\n');
	});

	it('ramène une vidéo à son identifiant ou à un lien (mod Video Player)', () => {
		expect(quoteText('A', '[video]https://www.youtube.com/watch?v=abc123[/video]', options)).toBe('[quote=A]abc123[/quote]\n');
		expect(quoteText('A', '[video]https://vimeo.com/42[/video]', options)).toBe('[quote=A][url]42[/url][/quote]\n');
	});

	it('sans BBCode : citation en « > »', () => {
		expect(quoteText('A', 'texte', { ...options, bbcode: false })).toBe('> A a écrit :\n\n> texte\n');
	});
});

describe('abonnement, promotion et droit d’écrire', () => {
	it('abonnement ajouté ou retiré selon la case', () => {
		expect(subscriptionChange(true, true, false)).toBe('add');
		expect(subscriptionChange(true, false, true)).toBe('remove');
		expect(subscriptionChange(true, true, true)).toBeNull();
		expect(subscriptionChange(false, true, false)).toBeNull();
	});

	it('promotion au palier de messages', () => {
		const promoted = viewer({ numPosts: 9, group: group({ promoteNextGroup: 5, promoteMinPosts: 10 }) });
		expect(promotionGroup(promoted)).toBe(5);
		expect(promotionGroup(viewer({ numPosts: 3, group: group({ promoteNextGroup: 5, promoteMinPosts: 10 }) }))).toBeNull();
		expect(promotionGroup(viewer())).toBeNull();
	});

	it('permissions du forum, sujet fermé, modérateur', () => {
		const target = (overrides: Partial<PostingTarget> = {}): PostingTarget => ({
			forum: { id: 1, name: 'F', moderators: new Map([['Max', 5]]), isRedirect: false },
			replyPermission: null,
			topicPermission: null,
			topic: { id: 10, subject: 'S', closed: false, isSubscribed: false },
			...overrides,
		});
		expect(canPostIn(viewer(), target())).toBe(true);
		expect(canPostIn(viewer(), target({ replyPermission: false }))).toBe(false);
		expect(canPostIn(guest, target())).toBe(false);
		expect(canPostIn(guest, target({ replyPermission: true }))).toBe(true);
		expect(canPostIn(viewer(), target({ topic: { id: 10, subject: 'S', closed: true, isSubscribed: false } }))).toBe(false);
		const moderator = viewer({ username: 'Max', group: group({ isModerator: true }) });
		expect(canPostIn(moderator, target({ topic: { id: 10, subject: 'S', closed: true, isSubscribed: false } }))).toBe(true);
		expect(canPostIn(viewer(), target({ topic: null, topicPermission: false }))).toBe(false);
	});
});

// --- Page ----------------------------------------------------------------------------------------

const memberCookie = `${sessionCookie(3)}`;

const forumInfo = (overrides: Partial<ForumInfo> = {}): ForumInfo => ({
	id: 2,
	name: 'Captures',
	redirectUrl: null,
	moderators: new Map(),
	numTopics: 0,
	sortBy: 'lastPost',
	topicPermission: null,
	isSubscribed: false,
	...overrides,
});

function data(overrides: Partial<FakeData> = {}): FakeData {
	return {
		users: [{ viewer: guest }, { viewer: viewer({ numPosts: 9, group: group({ promoteNextGroup: 5, promoteMinPosts: 10 }) }) }],
		topics: [topic({ id: 10, subject: 'Postez un « vintage »' }), topic({ id: 11, closed: true })],
		posts: new Map([[10, [post(100, { message: 'Premier [img]http://a.fr/i.png[/img]' }), post(101, { message: 'Second' })]]]),
		forumInfos: [forumInfo(), forumInfo({ id: 4, redirectUrl: 'https://example.test' })],
		...overrides,
	};
}

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

/** Ouvre le formulaire puis l'envoie avec le jeton CSRF reçu. */
async function submit(server: FastifyInstance, url: string, fields: Record<string, string>, cookie = memberCookie) {
	const page = await server.inject({ url, headers: { cookie } });
	const csrf =
		[page.headers['set-cookie']]
			.flat()
			.find((c) => c?.startsWith('avrobb_csrf='))
			?.split(';')[0] ?? '';
	const token = /name="csrf_token" value="([0-9a-f]+)"/.exec(page.body)?.[1] ?? '';
	return server.inject({
		method: 'POST',
		url: url.replace('post.php?', 'post.php?action=post&'),
		headers: { cookie: `${cookie}; ${csrf}`, 'content-type': 'application/x-www-form-urlencoded' },
		payload: new URLSearchParams({ csrf_token: token, form_sent: '1', ...fields }).toString(),
	});
}

describe('GET /post.php', () => {
	it('affiche le formulaire de réponse avec le rappel de la discussion', async () => {
		app = await buildApp(fakeDeps(data()));
		const res = await app.inject({ url: '/post.php?tid=10', headers: { cookie: memberCookie } });
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('<title>Répondre / Forum de test</title>');
		expect(res.body).toContain('action="post.php?action=post&amp;tid=10"');
		expect(res.body).toContain('Postez un « vintage »');
		expect(res.body).toContain('Résumé de la discussion');
		expect(res.body).toContain('name="subscribe"');
		expect(res.body).not.toContain('name="req_subject"');
		// Le second message (plus récent) est rappelé en premier.
		expect(res.body.indexOf('Second')).toBeLessThan(res.body.indexOf('Premier'));
	});

	it('nouvelle discussion : sujet et préfixes PV', async () => {
		app = await buildApp(fakeDeps(data()));
		const res = await app.inject({ url: '/post.php?fid=2', headers: { cookie: memberCookie } });
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('name="req_subject"');
		expect(res.body).toContain('data-prefix="[MSFS]"');
		expect(res.body).toContain('data-prefix="[FS-24]"');
		expect(res.body).not.toContain('postreview');
	});

	it('cite un message du sujet, sans ses images', async () => {
		app = await buildApp(fakeDeps(data()));
		const res = await app.inject({ url: '/post.php?tid=10&qid=100', headers: { cookie: memberCookie } });
		expect(res.body).toContain('>[quote=Tessy]Premier http://a.fr/i.png[/quote]\n</textarea>');
		expect((await app.inject({ url: '/post.php?tid=10&qid=999', headers: { cookie: memberCookie } })).statusCode).toBe(404);
	});

	it('cite seulement le passage sélectionné (qtext), sous le nom de l’auteur du message', async () => {
		app = await buildApp(fakeDeps(data()));
		const res = await app.inject({ url: '/post.php?tid=10&qid=100&qtext=%20Premier%20<b>%20', headers: { cookie: memberCookie } });
		expect(res.body).toContain('>[quote=Tessy]Premier &lt;b&gt;[/quote]\n</textarea>');
		// Sélection vide : message entier ; message d'un autre sujet : refusé.
		expect((await app.inject({ url: '/post.php?tid=10&qid=100&qtext=', headers: { cookie: memberCookie } })).body).toContain(
			'[quote=Tessy]Premier http://a.fr/i.png[/quote]',
		);
		expect((await app.inject({ url: '/post.php?tid=10&qid=999&qtext=x', headers: { cookie: memberCookie } })).statusCode).toBe(404);
	});

	it('refuse les demandes invalides et les écritures interdites', async () => {
		app = await buildApp(fakeDeps(data()));
		const status = async (url: string, cookie = memberCookie) => (await app?.inject({ url, headers: { cookie } }))?.statusCode;
		expect(await status('/post.php')).toBe(404);
		expect(await status('/post.php?tid=10&fid=2')).toBe(404);
		expect(await status('/post.php?tid=99')).toBe(404);
		expect(await status('/post.php?fid=4')).toBe(400);
		expect(await status('/post.php?tid=11')).toBe(403);
		expect(await status('/post.php?tid=10', '')).toBe(403);
	});
});

describe('POST /post.php', () => {
	it('exige le jeton CSRF', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const res = await app.inject({
			method: 'POST',
			url: '/post.php?action=post&tid=10',
			headers: { cookie: memberCookie, 'content-type': 'application/x-www-form-urlencoded' },
			payload: 'form_sent=1&req_message=Coucou',
		});
		expect(res.statusCode).toBe(403);
		expect(fake.savedReplies).toBeUndefined();
	});

	it('prévisualise sans enregistrer', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const res = await submit(app, '/post.php?tid=10', { req_message: '[b]Gras[/b] <script>', preview: '1' });
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('Prévisualisation du message');
		expect(res.body).toContain('<strong>Gras</strong> &lt;script&gt;');
		expect(res.body).toContain('>[b]Gras[/b] &lt;script&gt;</textarea>');
		expect(fake.savedReplies).toBeUndefined();
	});

	it('réaffiche le formulaire avec les erreurs', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const res = await submit(app, '/post.php?fid=2', { req_subject: 'Mon sujet', req_message: '[quote]sans fin' });
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('La balise [quote] a été trouvée sans balise [/quote] correspondante');
		expect(res.body).toContain('value="Mon sujet"');
		expect(fake.savedTopics).toBeUndefined();
	});

	it('enregistre une réponse, abonne, promeut, marque le sujet lu et prévient les abonnés', async () => {
		const fake = data({ subscribers: [{ email: 'abonne@example.test', notifyWithPost: true }] });
		app = await buildApp(fakeDeps(fake));
		const res = await submit(app, '/post.php?tid=10', { req_message: 'Superbe avion www.pilote-virtuel.com', subscribe: '1' });
		expect(res.statusCode).toBe(302);
		expect(res.headers.location).toBe('viewtopic.php?pid=901#p901');
		expect(fake.savedReplies).toEqual([
			expect.objectContaining({
				topicId: 10,
				forumId: 1,
				author: { kind: 'member', id: 3, username: 'Tessy', promoteTo: 5 },
				message: 'Superbe avion [url=http://www.pilote-virtuel.com]www.pilote-virtuel.com[/url]',
				subscription: 'add',
				words: { post: ['superbe', 'avion', 'http', 'www', 'pilote-virtuel', 'com'], subject: [] },
				now: NOW,
			}),
		]);
		const track = [res.headers['set-cookie']].flat().find((c) => c?.startsWith('avrobb_track='));
		expect(track).toContain(`t10%3D${NOW}`);
		expect(fake.sentMails).toEqual([expect.objectContaining({ to: 'abonne@example.test', subject: 'Sujet new_reply_full' })]);
	});

	it('avec une balise de simulateur : publiée sans avertissement', async () => {
		const fake = data({ forumInfos: [forumInfo({ topicPermission: true })] });
		app = await buildApp(fakeDeps(fake));
		const fields = { req_subject: '[MSFS] Premier vol', req_message: 'Bonjour', req_username: 'Pilote', req_email: 'p@example.test' };
		expect((await submit(app, '/post.php?fid=2', fields, '')).statusCode).toBe(302);
	});

	it('crée une discussion d’invité avec son e-mail', async () => {
		const fake = data({ forumInfos: [forumInfo({ topicPermission: true })] });
		app = await buildApp(fakeDeps(fake));
		const fields = { req_subject: 'Premier vol', req_message: 'Bonjour', req_username: 'Pilote', req_email: 'Pilote@Example.test' };
		// Sans balise de simulateur : avertissement, rien n'est publié ; le second envoi publie.
		const warned = await submit(app, '/post.php?fid=2', fields, '');
		expect(warned.statusCode).toBe(200);
		expect(warned.body).toContain('Aucune balise de simulateur');
		expect(warned.body).toContain('<input type="hidden" name="no_tag_ok" value="1">');
		expect(warned.body).toContain('value="Premier vol"');
		expect(fake.savedTopics).toBeUndefined();
		const res = await submit(app, '/post.php?fid=2', { ...fields, no_tag_ok: '1' }, '');
		expect(res.statusCode).toBe(302);
		expect(res.headers.location).toBe('viewtopic.php?pid=901#p901');
		expect(fake.savedTopics).toEqual([
			expect.objectContaining({
				forumId: 2,
				subject: 'Premier vol',
				sticky: false,
				author: { kind: 'guest', username: 'Pilote', email: 'pilote@example.test' },
				words: { post: ['bonjour'], subject: ['premier', 'vol'] },
			}),
		]);
	});
});
