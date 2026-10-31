/**
 * Bouton « Accepter » d'un retour Phraséo (phraseo_accept.php) de bout en bout avec les doublures :
 * affichage réservé aux administrateurs dans le forum privé « à trier », rappel d'en-tête remplacé,
 * sujet déplacé vers le forum public, refus sans droit.
 */

import { describe, expect, it } from 'vitest';
import { buildApp, type ForumApp } from '../src/app.ts';
import { GroupId, type TopicSummary } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { phraseoFeedback as texts } from '../src/lang/fr/phraseoFeedback.ts';
import { toBoardConfig } from '../src/services/boardConfig.ts';
import { canAcceptPhraseoFeedback } from '../src/services/permissions.ts';
import { publicPhraseoFeedbackMessage } from '../src/services/phraseoFeedback.ts';
import { type FakeData, fakeDeps, group, guest, NOW, post, sessionCookie, topic, viewer } from './fixtures.ts';
import { inject } from './inject.ts';

const SEED = 'graine-de-test';
const CSRF_SECRET = '9'.repeat(64);
const admin = viewer({ id: 2, username: 'admin', group: group({ id: GroupId.Admin }) });
const member = viewer();
const cookies = (userId: number): string => `${sessionCookie(userId)}; avrobb_csrf=${CSRF_SECRET}`;

/** Forum privé « à trier » n° 6, forum public de la phraséologie n° 4 */
const FEEDBACK = { forumId: 6, userId: 4, targetForumId: 4 };
const MESSAGE = `[i]${texts.header}[/i]\n\n[b]Type :[/b] Bug technique\n\nLa voix se répète.`;

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
			topic({ id: 10, subject: 'Autre sujet', firstPostId: 100, forum: { id: 2, name: 'Captures', moderators: new Map() } }),
		],
		posts: new Map([
			[20, [post(200, { username: 'Retours Phraséo', message: MESSAGE })]],
			[10, [post(100)]],
		]),
		moderatedTopics: [
			{ id: 20, subject: summary(20).subject, numReplies: 0, firstPostId: 200, forum: { id: 6, name: 'Retours Phraséo (à trier)' } },
		],
		forumTopics: new Map([[6, [summary(20)]]]),
		targetForums: [{ categoryId: 1, categoryName: 'Projets', forumId: 4, forumName: 'Phraséologie aéronautique' }],
		config: { phraseoFeedback: FEEDBACK },
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
		const config = { phraseoFeedback: FEEDBACK };
		expect(canAcceptPhraseoFeedback(admin, 6, config)).toBe(true);
		expect(canAcceptPhraseoFeedback(member, 6, config)).toBe(false);
		expect(canAcceptPhraseoFeedback(admin, 2, config)).toBe(false);
		expect(canAcceptPhraseoFeedback(admin, 6, { phraseoFeedback: { ...FEEDBACK, targetForumId: null } })).toBe(false);
	});

	it('destination lue dans la configuration ; 0 ou le forum privé lui-même : bouton masqué', () => {
		const config = (target: string) =>
			toBoardConfig(
				new Map([
					['o_phraseo_feedback_forum', '6'],
					['o_phraseo_feedback_user', '4'],
					['o_phraseo_feedback_target', target],
				]),
			).phraseoFeedback;
		expect(config('4')?.targetForumId).toBe(4);
		expect(config('0')?.targetForumId).toBeNull();
		expect(config('6')?.targetForumId).toBeNull();
	});

	it('rappel d’en-tête remplacé, reste du message inchangé', () => {
		const message = publicPhraseoFeedbackMessage(MESSAGE, texts);
		expect(message).toContain(`[i]${texts.publicHeader}[/i]`);
		expect(message).not.toContain(texts.header);
		expect(message).toContain('La voix se répète.');
	});
});

describe('phraseo_accept.php', () => {
	it('bouton affiché à l’administrateur dans le forum privé seulement', async () => {
		const { server } = await start();
		const page = await get(server, 2, '/viewtopic.php?id=20');
		expect(page.body).toContain('action="/phraseo_accept.php?id=20"');
		expect((await get(server, 2, '/viewtopic.php?id=10')).body).not.toContain('phraseo_accept.php');
	});

	it('publie : en-tête remplacé (modification silencieuse, réindexée), sujet déplacé vers le forum public', async () => {
		const { server, fake } = await start();
		const res = await postForm(server, 2, '/phraseo_accept.php?id=20');
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
		expect((await postForm(server, member.id, '/phraseo_accept.php?id=20')).statusCode).toBe(403);
		expect((await postForm(server, 2, '/phraseo_accept.php?id=10')).statusCode).toBe(404);
		expect((await postForm(server, 2, '/phraseo_accept.php?id=20', false)).statusCode).toBeGreaterThanOrEqual(400);
		expect(fake.postUpdates ?? []).toEqual([]);
		expect(fake.moderationLog ?? []).toEqual([]);
	});
});
