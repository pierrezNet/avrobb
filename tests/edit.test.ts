/**
 * Modification (edit.php) et suppression (delete.php) d'un message : droits, formulaire,
 * enregistrement, confirmation et redirections.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { GroupId } from '../src/domain/models.ts';
import { canDeletePost, canEditPost, EDIT_WINDOW_SECONDS, type PostOwnership } from '../src/services/permissions.ts';
import { type FakeData, fakeDeps, group, guest, NOW, post, sessionCookie, topic, viewer } from './fixtures.ts';

const tessy = sessionCookie(3);
const max = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true }) });
const modForum = { id: 1, name: 'Forum', moderators: new Map([['MaxDUO', 5]]) };

describe('canEditPost / canDeletePost', () => {
	const own: PostOwnership = {
		posterId: 3,
		posterIsAdmin: false,
		posted: NOW - 60,
		isTopicPost: false,
		topic: { closed: false },
		forum: { moderators: new Map() },
	};

	it('l’auteur, dans le délai, sujet ouvert, selon son groupe', () => {
		expect(canEditPost(viewer(), own, NOW)).toBe(true);
		expect(canEditPost(viewer(), { ...own, posted: NOW - EDIT_WINDOW_SECONDS - 1 }, NOW)).toBe(false);
		expect(canEditPost(viewer(), { ...own, topic: { closed: true } }, NOW)).toBe(false);
		expect(canEditPost(viewer({ group: group({ canEditPosts: false }) }), own, NOW)).toBe(false);
		expect(canEditPost(viewer(), { ...own, posterId: 4 }, NOW)).toBe(false);
		expect(canEditPost(guest, { ...own, posterId: 1 }, NOW)).toBe(false);
		expect(canDeletePost(viewer(), { ...own, posted: 0 })).toBe(true);
		expect(canDeletePost(viewer({ group: group({ canDeleteTopics: false }) }), { ...own, isTopicPost: true })).toBe(false);
	});

	it('le modérateur du forum, sans délai, sauf sur un message d’administrateur', () => {
		const moderated = { ...own, posterId: 4, posted: 0, topic: { closed: true }, forum: modForum };
		expect(canEditPost(max, moderated, NOW)).toBe(true);
		expect(canDeletePost(max, moderated)).toBe(true);
		expect(canEditPost(max, { ...moderated, posterIsAdmin: true }, NOW)).toBe(false);
	});
});

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

function data(overrides: Partial<FakeData> = {}): FakeData {
	return {
		users: [{ viewer: guest }, { viewer: viewer() }, { viewer: max }],
		topics: [topic({ id: 10, subject: 'Mon sujet', firstPostId: 100, forum: modForum })],
		posts: new Map([[10, [post(100, { posted: NOW - 60 }), post(101, { posted: NOW - 30, message: 'Réponse [b]zut[/b]' })]]]),
		...overrides,
	};
}

async function submit(server: FastifyInstance, url: string, fields: Record<string, string>, session = tessy) {
	const page = await server.inject({ url, headers: { cookie: session } });
	const csrf =
		[page.headers['set-cookie']]
			.flat()
			.find((c) => c?.startsWith('avrobb_csrf='))
			?.split(';')[0] ?? '';
	const token = /name="csrf_token" value="([0-9a-f]+)"/.exec(page.body)?.[1] ?? '';
	return server.inject({
		method: 'POST',
		url,
		headers: { cookie: `${session}; ${csrf}`, 'content-type': 'application/x-www-form-urlencoded' },
		payload: new URLSearchParams({ csrf_token: token, form_sent: '1', ...fields }).toString(),
	});
}

describe('edit.php', () => {
	it('présente le premier message avec son sujet ; une réponse sans sujet', async () => {
		app = await buildApp(fakeDeps(data()));
		const first = await app.inject({ url: '/edit.php?id=100', headers: { cookie: tessy } });
		expect(first.statusCode).toBe(200);
		expect(first.body).toContain('Modifier le message et valider les modifications');
		expect(first.body).toContain('value="Mon sujet"');
		expect(first.body).not.toContain('name="silent"');
		const reply = await app.inject({ url: '/edit.php?id=101', headers: { cookie: tessy } });
		expect(reply.body).not.toContain('name="req_subject"');
		expect(reply.body).toContain('>Réponse [b]zut[/b]</textarea>');
	});

	it('présente le texte d’origine, non censuré (la censure reste à l’affichage)', async () => {
		app = await buildApp(fakeDeps(data({ config: { censoring: true }, censoredWords: [{ searchFor: 'zut', replaceWith: '***' }] })));
		const res = await app.inject({ url: '/edit.php?id=101', headers: { cookie: tessy } });
		expect(res.body).toContain('>Réponse [b]zut[/b]</textarea>');
	});

	it('refuse hors délai, sur le message d’un autre, ou un identifiant inconnu', async () => {
		app = await buildApp(
			fakeDeps(data({ posts: new Map([[10, [post(100, { posted: NOW - 3600 }), post(101, { author: null, username: 'Invité' })]]]) })),
		);
		const status = async (url: string) => (await app?.inject({ url, headers: { cookie: tessy } }))?.statusCode;
		expect(await status('/edit.php?id=100')).toBe(403);
		expect(await status('/edit.php?id=101')).toBe(403);
		expect(await status('/edit.php?id=999')).toBe(404);
		expect(await status('/edit.php')).toBe(404);
	});

	it('enregistre le message, le sujet et la mention de modification', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const res = await submit(app, '/edit.php?id=100&action=edit', {
			req_subject: 'Nouveau sujet',
			req_message: 'Texte [I]revu[/I]',
			stick_topic: '1',
		});
		expect(res.statusCode).toBe(302);
		expect(res.headers.location).toBe('viewtopic.php?pid=100#p100');
		expect(fake.postUpdates).toEqual([
			{
				postId: 100,
				topicId: 10,
				message: 'Texte [i]revu[/i]',
				hideSmilies: false,
				edited: { at: NOW, by: 'Tessy' },
				// Un membre ne change pas l'épinglage.
				topic: { subject: 'Nouveau sujet', sticky: false },
				words: { post: ['texte', 'revu'], subject: ['nouveau', 'sujet'] },
			},
		]);
	});

	it('modérateur : modification silencieuse et épinglage', async () => {
		const fake = data({ posts: new Map([[10, [post(100, { posted: 0 })]]]) });
		app = await buildApp(fakeDeps(fake));
		const page = await app.inject({ url: '/edit.php?id=100', headers: { cookie: sessionCookie(5) } });
		expect(page.body).toContain('name="silent" value="1" checked');
		const res = await submit(
			app,
			'/edit.php?id=100&action=edit',
			{ req_subject: 'S', req_message: 'M', silent: '1', stick_topic: '1' },
			sessionCookie(5),
		);
		expect(res.statusCode).toBe(302);
		expect(fake.postUpdates?.[0]).toMatchObject({ edited: null, topic: { subject: 'S', sticky: true } });
	});

	it('erreurs et prévisualisation sans enregistrer', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const errors = await submit(app, '/edit.php?id=100&action=edit', { req_subject: '', req_message: 'x' });
		expect(errors.body).toContain('Vous devez indiquer un sujet.');
		const preview = await submit(app, '/edit.php?id=101&action=edit', { req_message: '[b]vu[/b]', preview: '1' });
		expect(preview.body).toContain('<strong>vu</strong>');
		expect(fake.postUpdates).toBeUndefined();
	});
});

describe('delete.php', () => {
	it('confirme puis supprime une réponse et revient au message précédent', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const page = await app.inject({ url: '/delete.php?id=101', headers: { cookie: tessy } });
		expect(page.statusCode).toBe(200);
		expect(page.body).toContain('Vous êtes sur le point de supprimer définitivement ce message');
		const res = await submit(app, '/delete.php?id=101', { delete: '1' });
		expect(res.headers.location).toBe('viewtopic.php?pid=100#p100');
		expect(fake.deletedPosts).toEqual([101]);
	});

	it('supprimer le premier message supprime la discussion', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		expect((await app.inject({ url: '/delete.php?id=100', headers: { cookie: tessy } })).body).toContain(
			'toute la discussion sera définitivement supprimée',
		);
		const res = await submit(app, '/delete.php?id=100', { delete: '1' });
		expect(res.headers.location).toBe('viewforum.php?id=1');
		expect(fake.deletedTopics).toEqual([10]);
	});

	it('refuse sans droit, et sans jeton CSRF', async () => {
		const fake = data({ posts: new Map([[10, [post(100, { author: null })]]]) });
		app = await buildApp(fakeDeps(fake));
		expect((await app.inject({ url: '/delete.php?id=100', headers: { cookie: tessy } })).statusCode).toBe(403);
		await app.close();
		app = await buildApp(fakeDeps(fake));
		const res = await app.inject({
			method: 'POST',
			url: '/delete.php?id=100',
			headers: { cookie: sessionCookie(5), 'content-type': 'application/x-www-form-urlencoded' },
			payload: 'delete=1',
		});
		expect(res.statusCode).toBe(403);
		expect(fake.deletedTopics).toBeUndefined();
	});
});
