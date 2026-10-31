/**
 * Bouton « Accepter » d'un retour d'application (feedback_accept.php) de bout en bout avec les
 * doublures, pour Phraséo et Donne Ton Point : affichage réservé aux administrateurs dans le forum
 * privé « à trier » de l'application, rappel d'en-tête remplacé, sujet déplacé vers le forum public de
 * cette application, refus sans droit.
 */

import { describe, expect, it } from 'vitest';
import { buildApp, type ForumApp } from '../src/app.ts';
import { GroupId, type TopicSummary } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { appFeedback } from '../src/lang/fr/appFeedback.ts';
import { publicAppFeedbackMessage } from '../src/services/appFeedback.ts';
import { toBoardConfig } from '../src/services/boardConfig.ts';
import { acceptableAppFeedback, canAcceptAppFeedback } from '../src/services/permissions.ts';
import { type FakeData, fakeDeps, group, guest, NOW, post, sessionCookie, topic, viewer } from './fixtures.ts';
import { inject } from './inject.ts';

const SEED = 'graine-de-test';
const CSRF_SECRET = '9'.repeat(64);
const admin = viewer({ id: 2, username: 'admin', group: group({ id: GroupId.Admin }) });
const member = viewer();
const cookies = (userId: number): string => `${sessionCookie(userId)}; avrobb_csrf=${CSRF_SECRET}`;

const texts = appFeedback.phraseo;
const dtpTexts = appFeedback.donneTonPoint;
/** Phraséo : forum privé « à trier » n° 6, forum public de la phraséologie n° 4 */
const FEEDBACK = { forumId: 6, userId: 4, targetForumId: 4 };
/** Donne Ton Point : forum privé « à trier » n° 7, forum public « Donne ton point » n° 3 */
const DTP = { forumId: 7, userId: 5, targetForumId: 3 };
const APP_FEEDBACK = { phraseo: FEEDBACK, donneTonPoint: DTP };
const MESSAGE = `[i]${texts.header}[/i]\n\n[b]Type :[/b] Bug technique\n\nLa voix se répète.`;
const DTP_MESSAGE = `[i]${dtpTexts.header}[/i]\n\n[b]Type :[/b] Bug\n\nLe compteur ne bouge plus.`;

const summary = (id: number): TopicSummary => ({
	id,
	poster: 'Retours Phraséo',
	subject: '[Phraséo] Bug technique : La voix se répète.',
	posted: NOW - 60,
	lastPost: { postedAt: NOW - 60, postId: 200, poster: 'Retours Phraséo' },
	numViews: 0,
	numReplies: 0,
	closed: false,
	sticky: false,
	movedTo: null,
	hasPosted: false,
});

function data(overrides: Partial<FakeData> = {}): FakeData {
	return {
		users: [{ viewer: guest }, { viewer: member }, { viewer: admin }],
		topics: [
			topic({
				id: 20,
				subject: summary(20).subject,
				firstPostId: 200,
				forum: { id: 6, name: 'Retours Phraséo (à trier)', moderators: new Map() },
			}),
			topic({
				id: 30,
				subject: '[Donne Ton Point] Bug : Le compteur ne bouge plus.',
				firstPostId: 300,
				forum: { id: 7, name: 'Retours Donne Ton Point (à trier)', moderators: new Map() },
			}),
			topic({ id: 10, subject: 'Autre sujet', firstPostId: 100, forum: { id: 2, name: 'Captures', moderators: new Map() } }),
		],
		posts: new Map([
			[20, [post(200, { username: 'Retours Phraséo', message: MESSAGE })]],
			[30, [post(300, { username: 'Retours Donne Ton Point', message: DTP_MESSAGE })]],
			[10, [post(100)]],
		]),
		moderatedTopics: [
			{ id: 20, subject: summary(20).subject, numReplies: 0, firstPostId: 200, forum: { id: 6, name: 'Retours Phraséo (à trier)' } },
			{
				id: 30,
				subject: '[Donne Ton Point] Bug : Le compteur ne bouge plus.',
				numReplies: 0,
				firstPostId: 300,
				forum: { id: 7, name: 'Retours Donne Ton Point (à trier)' },
			},
		],
		forumTopics: new Map([
			[6, [summary(20)]],
			[7, [{ ...summary(30), poster: 'Retours Donne Ton Point', subject: '[Donne Ton Point] Bug : Le compteur ne bouge plus.' }]],
		]),
		targetForums: [
			{ categoryId: 1, categoryName: 'Projets', forumId: 3, forumName: 'Donne ton point' },
			{ categoryId: 1, categoryName: 'Projets', forumId: 4, forumName: 'Phraséologie aéronautique' },
		],
		config: { appFeedback: APP_FEEDBACK },
		...overrides,
	};
}

async function start(fake = data()): Promise<{ server: ForumApp; fake: FakeData }> {
	return { server: await buildApp(fakeDeps(fake)), fake };
}

const get = (server: ForumApp, userId: number, url: string) => inject(server, { url, headers: { cookie: cookies(userId) } });

function postForm(server: ForumApp, userId: number, url: string, withCsrf = true) {
	const body = new URLSearchParams(withCsrf ? { csrf_token: csrfToken(CSRF_SECRET, SEED, userId) } : {});
	return inject(server, {
		method: 'POST',
		url,
		headers: { cookie: cookies(userId), 'content-type': 'application/x-www-form-urlencoded' },
		payload: body.toString(),
	});
}

describe('règles', () => {
	it('administrateur, forum privé « à trier », destination configurée', () => {
		const config = { appFeedback: APP_FEEDBACK };
		expect(canAcceptAppFeedback(admin, 'phraseo', 6, config)).toBe(true);
		expect(canAcceptAppFeedback(member, 'phraseo', 6, config)).toBe(false);
		expect(canAcceptAppFeedback(admin, 'phraseo', 2, config)).toBe(false);
		expect(
			canAcceptAppFeedback(admin, 'phraseo', 6, { appFeedback: { ...APP_FEEDBACK, phraseo: { ...FEEDBACK, targetForumId: null } } }),
		).toBe(false);
	});

	it('Donne Ton Point : mêmes règles, chacune sur son forum privé', () => {
		const config = { appFeedback: APP_FEEDBACK };
		expect(canAcceptAppFeedback(admin, 'donneTonPoint', 7, config)).toBe(true);
		expect(canAcceptAppFeedback(admin, 'donneTonPoint', 6, config)).toBe(false);
		expect(canAcceptAppFeedback(admin, 'phraseo', 7, config)).toBe(false);
		expect(canAcceptAppFeedback(member, 'donneTonPoint', 7, config)).toBe(false);
		expect(acceptableAppFeedback(admin, 7, config)).toBe('donneTonPoint');
		expect(acceptableAppFeedback(admin, 6, config)).toBe('phraseo');
		expect(acceptableAppFeedback(admin, 2, config)).toBeNull();
		expect(acceptableAppFeedback(member, 7, config)).toBeNull();
		expect(acceptableAppFeedback(admin, 7, { appFeedback: { ...APP_FEEDBACK, donneTonPoint: null } })).toBeNull();
	});

	it('destination lue dans la configuration ; 0 ou le forum privé lui-même : bouton masqué', () => {
		const config = (target: string) =>
			toBoardConfig(
				new Map([
					['o_phraseo_feedback_forum', '6'],
					['o_phraseo_feedback_user', '4'],
					['o_phraseo_feedback_target', target],
				]),
			).appFeedback.phraseo;
		expect(config('4')?.targetForumId).toBe(4);
		expect(config('0')?.targetForumId).toBeNull();
		expect(config('6')?.targetForumId).toBeNull();
	});

	it('Donne Ton Point : réglages o_dtp_feedback_*, indépendants de ceux de Phraséo', () => {
		const config = toBoardConfig(
			new Map([
				['o_dtp_feedback_forum', '7'],
				['o_dtp_feedback_user', '5'],
				['o_dtp_feedback_target', '3'],
			]),
		).appFeedback;
		expect(config.donneTonPoint).toEqual(DTP);
		expect(config.phraseo).toBeNull();
		expect(toBoardConfig(new Map([['o_dtp_feedback_forum', '7']])).appFeedback.donneTonPoint).toBeNull();
	});

	it('rappel d’en-tête remplacé, reste du message inchangé', () => {
		const message = publicAppFeedbackMessage(MESSAGE, texts);
		expect(message).toContain(`[i]${texts.publicHeader}[/i]`);
		expect(message).not.toContain(texts.header);
		expect(message).toContain('La voix se répète.');
		const dtpMessage = publicAppFeedbackMessage(DTP_MESSAGE, dtpTexts);
		expect(dtpMessage).toContain(`[i]${dtpTexts.publicHeader}[/i]`);
		expect(dtpMessage).toContain('Le compteur ne bouge plus.');
	});
});

describe('feedback_accept.php', () => {
	it('bouton affiché à l’administrateur dans le forum privé seulement', async () => {
		const { server } = await start();
		const page = await get(server, 2, '/viewtopic.php?id=20');
		expect(page.body).toContain('action="/feedback_accept.php?app=phraseo&amp;id=20"');
		expect(page.body).toContain('Accepter : publier dans le forum de la phraséologie');
		expect((await get(server, 2, '/viewtopic.php?id=10')).body).not.toContain('feedback_accept.php');
	});

	it('publie : en-tête remplacé (modification silencieuse, réindexée), sujet déplacé vers le forum public', async () => {
		const { server, fake } = await start();
		const res = await postForm(server, 2, '/feedback_accept.php?app=phraseo&id=20');
		expect(res.statusCode).toBe(303);
		expect(res.headers.location).toBe('/sujet/20');
		const update = fake.postUpdates?.[0];
		expect(update?.postId).toBe(200);
		expect(update?.edited).toBeNull();
		expect(update?.message).toContain(texts.publicHeader);
		expect(update?.words.subject.length).toBeGreaterThan(0);
		expect(fake.moderationLog).toEqual(['move 20 -> 4']);
	});

	it('refuse un membre, un sujet hors du forum privé et l’absence de jeton CSRF', async () => {
		const { server, fake } = await start();
		expect((await postForm(server, member.id, '/feedback_accept.php?app=phraseo&id=20')).statusCode).toBe(403);
		expect((await postForm(server, 2, '/feedback_accept.php?app=phraseo&id=10')).statusCode).toBe(404);
		expect((await postForm(server, 2, '/feedback_accept.php?app=phraseo&id=20', false)).statusCode).toBeGreaterThanOrEqual(400);
		expect((await postForm(server, 2, '/feedback_accept.php?id=20')).statusCode).toBe(400);
		expect((await postForm(server, 2, '/feedback_accept.php?app=inconnue&id=20')).statusCode).toBe(400);
		expect((await postForm(server, 2, '/feedback_accept.php?app=__proto__&id=20')).statusCode).toBe(400);
		expect(fake.postUpdates ?? []).toEqual([]);
		expect(fake.moderationLog ?? []).toEqual([]);
	});
});

describe('feedback_accept.php : Donne Ton Point', () => {
	it('bouton propre à l’application, affiché à l’administrateur dans son forum privé seulement', async () => {
		const { server } = await start();
		const page = await get(server, 2, '/viewtopic.php?id=30');
		expect(page.body).toContain('action="/feedback_accept.php?app=donneTonPoint&amp;id=30"');
		expect(page.body).toContain('Accepter : publier dans le forum Donne ton point');
		expect((await get(server, member.id, '/viewtopic.php?id=30')).body).not.toContain('feedback_accept.php');
	});

	it('publie : en-tête remplacé, sujet déplacé vers o_dtp_feedback_target', async () => {
		const { server, fake } = await start();
		const res = await postForm(server, 2, '/feedback_accept.php?app=donneTonPoint&id=30');
		expect(res.statusCode).toBe(303);
		expect(res.headers.location).toBe('/sujet/30');
		const update = fake.postUpdates?.[0];
		expect(update?.postId).toBe(300);
		expect(update?.edited).toBeNull();
		expect(update?.message).toContain(dtpTexts.publicHeader);
		expect(update?.message).not.toContain(dtpTexts.header);
		expect(fake.moderationLog).toEqual(['move 30 -> 3']);
	});

	it('refuse un sujet de l’autre application, un membre, une cible non configurée', async () => {
		const { server, fake } = await start();
		// Sujet Phraséo annoncé comme Donne Ton Point (et inversement) : pas dans le forum privé attendu
		expect((await postForm(server, 2, '/feedback_accept.php?app=donneTonPoint&id=20')).statusCode).toBe(404);
		expect((await postForm(server, 2, '/feedback_accept.php?app=phraseo&id=30')).statusCode).toBe(404);
		expect((await postForm(server, member.id, '/feedback_accept.php?app=donneTonPoint&id=30')).statusCode).toBe(403);
		expect(fake.postUpdates ?? []).toEqual([]);
		expect(fake.moderationLog ?? []).toEqual([]);

		const noTarget = await start(data({ config: { appFeedback: { ...APP_FEEDBACK, donneTonPoint: { ...DTP, targetForumId: null } } } }));
		expect((await get(noTarget.server, 2, '/viewtopic.php?id=30')).body).not.toContain('feedback_accept.php');
		expect((await postForm(noTarget.server, 2, '/feedback_accept.php?app=donneTonPoint&id=30')).statusCode).toBe(400);
	});
});
