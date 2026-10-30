/**
 * Modération (moderate.php) de bout en bout avec les doublures : droits, liste des sujets, actions
 * groupées avec confirmation, messages d'un sujet, actions d'un seul sujet, consultation d'IP, et
 * pied de viewtopic (boutons POST).
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { type ForumInfo, GroupId, type TopicSummary } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { type FakeData, fakeDeps, group, guest, NOW, post, sessionCookie, topic, viewer } from './fixtures.ts';

const SEED = 'graine-de-test';
const CSRF_SECRET = '9'.repeat(64);

const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true }) });
const tessy = viewer();
const admin = viewer({ id: 2, username: 'admin', group: group({ id: GroupId.Admin }) });
const hashes: Record<number, string> = { 5: 'h5', 3: 'h3', 2: 'h2' };
const cookies = (userId: number): string => `${sessionCookie(userId)}; avrobb_csrf=${CSRF_SECRET}`;

const forum: ForumInfo = {
	id: 2,
	name: 'Captures',
	redirectUrl: null,
	moderators: new Map([['MaxDUO', 5]]),
	numTopics: 3,
	sortBy: 'lastPost',
	topicPermission: null,
	isSubscribed: false,
};

const summary = (id: number, subject: string): TopicSummary => ({
	id,
	poster: 'Tessy',
	subject,
	posted: NOW - 9000,
	lastPost: { postedAt: NOW - 60, postId: id * 10, poster: 'Tessy' },
	numViews: 3,
	numReplies: 2,
	closed: false,
	sticky: false,
	movedTo: null,
	hasPosted: false,
});

function data(overrides: Partial<FakeData> = {}): FakeData {
	return {
		users: [{ viewer: guest }, { viewer: mod }, { viewer: tessy }, { viewer: admin }],
		topics: [topic({ id: 10, subject: 'Vol de nuit', forum: { id: 2, name: 'Captures', moderators: forum.moderators } })],
		posts: new Map([
			[
				10,
				[
					post(100),
					post(101, { posterIp: '192.0.2.5' }),
					post(102, { username: 'admin', author: { ...(post(1).author ?? (null as never)), id: 2, groupId: GroupId.Admin } }),
				],
			],
		]),
		forumInfos: [forum],
		forumTopics: new Map([[2, [summary(10, 'Vol de nuit'), summary(11, 'Doublon'), summary(12, 'Archive')]]]),
		moderatedTopics: [{ id: 10, subject: 'Vol de nuit', numReplies: 2, firstPostId: 100, forum: { id: 2, name: 'Captures' } }],
		targetForums: [
			{ categoryId: 1, categoryName: 'Simulateurs', forumId: 1, forumName: 'Technique' },
			{ categoryId: 2, categoryName: 'Ateliers', forumId: 2, forumName: 'Captures' },
		],
		...overrides,
	};
}

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

async function start(fake = data()): Promise<{ server: FastifyInstance; fake: FakeData }> {
	app = await buildApp(fakeDeps(fake));
	return { server: app, fake };
}

const get = (server: FastifyInstance, userId: number, url: string) => server.inject({ url, headers: { cookie: cookies(userId) } });

function post_(server: FastifyInstance, userId: number, url: string, fields: Record<string, string | string[]>) {
	const body = new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, userId) });
	for (const [name, value] of Object.entries(fields)) for (const item of [value].flat()) body.append(name, item);
	return server.inject({
		method: 'POST',
		url,
		headers: { cookie: cookies(userId), 'content-type': 'application/x-www-form-urlencoded' },
		payload: body.toString(),
	});
}

describe('accès', () => {
	it('réservé aux modérateurs du forum', async () => {
		const { server } = await start();
		expect((await server.inject('/moderate.php?fid=2')).statusCode).toBe(403);
		expect((await get(server, 3, '/moderate.php?fid=2')).statusCode).toBe(403);
		expect((await get(server, 5, '/moderate.php?fid=99')).statusCode).toBe(404);
		expect((await get(server, 5, '/moderate.php?fid=2')).statusCode).toBe(200);
		expect((await get(server, 2, '/moderate.php?fid=2')).statusCode).toBe(200);
	});

	it("consultation d'une IP par numéro de message ou adresse", async () => {
		const { server } = await start();
		const res = await get(server, 5, '/moderate.php?get_host=101');
		expect(res.body).toContain('L&#39;adresse IP est : 192.0.2.5');
		expect(res.body).toContain('pilote.example.test');
		expect(res.body).toContain('admin_users.php?show_users=192.0.2.5');
		expect((await get(server, 5, '/moderate.php?get_host=2001:db8::1')).body).toContain('2001:db8::1');
		expect((await get(server, 3, '/moderate.php?get_host=101')).statusCode).toBe(403);
	});
});

describe('sujets du forum', () => {
	it('liste les sujets avec leurs cases à cocher et les actions groupées', async () => {
		const { server } = await start();
		const res = await get(server, 5, '/moderate.php?fid=2');
		expect(res.body.match(/name="topics" value="/g)).toHaveLength(3);
		expect(res.body).toContain('name="merge_topics"');
	});

	it('ferme une sélection et redirige avec un avis', async () => {
		const { server, fake } = await start();
		const res = await post_(server, 5, '/moderate.php?fid=2', { close: '1', topics: ['10', '11'] });
		expect(res.headers.location).toBe('moderate.php?fid=2&done=closed');
		expect(fake.moderationLog).toEqual(['close 10,11']);
		expect((await get(server, 5, '/moderate.php?fid=2&done=closed')).body).toContain('Discussions fermées.');
		expect((await post_(server, 5, '/moderate.php?fid=2', { open: '1' })).body).toContain('Vous devez choisir au moins une discussion');
	});

	it('déplace après le choix du forum, avec un lien de redirection', async () => {
		const { server, fake } = await start();
		const form = await post_(server, 5, '/moderate.php?fid=2', { move_topics: '1', topics: ['10', '12'] });
		expect(form.body).toContain('name="topics" value="10,12"');
		expect(form.body).toContain('<option value="1">Technique</option>');
		expect(form.body).not.toContain('<option value="2">Captures</option>');
		const done = await post_(server, 5, '/moderate.php?fid=2', {
			move_topics_to: '1',
			topics: '10,12',
			move_to_forum: '1',
			with_redirect: '1',
		});
		expect(done.headers.location).toBe('viewforum.php?id=1');
		expect(fake.moderationLog).toEqual(['move 10,12 -> 1 +redirect']);
	});

	it('fusionne et supprime après confirmation', async () => {
		const { server, fake } = await start();
		expect((await post_(server, 5, '/moderate.php?fid=2', { merge_topics: '1', topics: '10' })).body).toContain('au moins 2 discussions');
		const confirm = await post_(server, 5, '/moderate.php?fid=2', { merge_topics: '1', topics: ['10', '11'] });
		expect(confirm.body).toContain('name="merge_topics_comply"');
		await post_(server, 5, '/moderate.php?fid=2', { merge_topics_comply: '1', topics: '10,11' });
		await post_(server, 5, '/moderate.php?fid=2', { delete_topics_comply: '1', topics: '12' });
		expect(fake.moderationLog).toEqual(['merge 10,11', 'deleteTopics 12']);
	});
});

describe('messages d’un sujet', () => {
	it('le premier message ne se sélectionne pas', async () => {
		const { server } = await start();
		const res = await get(server, 5, '/moderate.php?fid=2&tid=10');
		expect(res.body).not.toContain('name="posts" value="100"');
		expect(res.body).toContain('name="posts" value="101"');
		expect(res.body).toContain('Le premier message ne peut pas être sélectionné');
	});

	it('supprime des réponses, mais pas celles d’un administrateur pour un modérateur', async () => {
		const { server, fake } = await start();
		const confirm = await post_(server, 5, '/moderate.php?fid=2&tid=10', { delete_posts: '1', posts: ['101'] });
		expect(confirm.body).toContain('name="delete_posts_comply"');
		const refused = await post_(server, 5, '/moderate.php?fid=2&tid=10', { delete_posts_comply: '1', posts: '101,102' });
		expect(refused.body).toContain('seul un administrateur peut les supprimer');
		const ok = await post_(server, 2, '/moderate.php?fid=2&tid=10', { delete_posts_comply: '1', posts: '101,102' });
		expect(ok.headers.location).toBe('viewtopic.php?id=10');
		expect(fake.moderationLog).toEqual(['deletePosts 10 101,102']);
	});

	it('scinde dans un nouveau sujet, sujet obligatoire', async () => {
		const { server, fake } = await start();
		const form = await post_(server, 5, '/moderate.php?fid=2&tid=10', { split_posts: '1', posts: '101' });
		expect(form.body).toContain('name="new_subject"');
		expect(form.body).toContain('<option value="2" selected>Captures</option>');
		const missing = await post_(server, 5, '/moderate.php?fid=2&tid=10', {
			split_posts_comply: '1',
			posts: '101',
			new_subject: ' ',
			move_to_forum: '1',
		});
		expect(missing.body).toContain('Vous devez indiquer un sujet.');
		const done = await post_(server, 5, '/moderate.php?fid=2&tid=10', {
			split_posts_comply: '1',
			posts: '101',
			new_subject: 'Hors sujet',
			move_to_forum: '1',
		});
		expect(done.headers.location).toBe('viewtopic.php?id=999');
		expect(fake.moderationLog).toEqual(['split 10 101 -> 1 Hors sujet']);
	});
});

describe('actions sur un seul sujet', () => {
	it('un ancien lien GET demande confirmation, le POST applique', async () => {
		const { server, fake } = await start();
		const confirm = await get(server, 5, '/moderate.php?fid=2&stick=10');
		expect(confirm.body).toContain('action="moderate.php?fid=2&amp;stick=10"');
		expect(fake.moderationLog).toBeUndefined();
		const res = await post_(server, 5, '/moderate.php?fid=2&stick=10', {});
		expect(res.headers.location).toBe('viewtopic.php?id=10');
		await post_(server, 5, '/moderate.php?fid=2&close=10', {});
		expect(fake.moderationLog).toEqual(['stick 10', 'close 10']);
		expect((await post_(server, 5, '/moderate.php?fid=2&unstick=77', {})).statusCode).toBe(400);
	});

	it('pied de viewtopic : boutons POST pour le modérateur', async () => {
		const { server } = await start(data({}));
		const res = await get(server, 5, '/viewtopic.php?id=10');
		expect(res.body).toContain('action="moderate.php?fid=2&amp;close=10"');
		expect(res.body).not.toContain('balise=');
		expect(res.body).toContain('href="moderate.php?fid=2&amp;tid=10&amp;p=1"');
	});
});
