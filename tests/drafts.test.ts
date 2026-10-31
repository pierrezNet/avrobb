/**
 * Brouillons de PV : enregistrement et reprise depuis post.php, liste, suppression et
 * modification (draft_list.php, draft_edit.php).
 */

import { describe, expect, it } from 'vitest';
import { buildApp, type ForumApp } from '../src/app.ts';
import type { Draft, ForumInfo } from '../src/domain/models.ts';
import { type FakeData, fakeDeps, guest, NOW, post, sessionCookie, topic, viewer } from './fixtures.ts';
import { inject } from './inject.ts';

const tessy = `${sessionCookie(3)}`;

const draft = (overrides: Partial<Draft> = {}): Draft => ({
	id: 5,
	posterId: 3,
	subject: 'Mon vol de nuit',
	message: '[b]Brouillon[/b] du récit',
	posted: NOW - 3600,
	topicId: null,
	forum: { id: 2, name: 'Captures' },
	...overrides,
});

const forumInfo: ForumInfo = {
	id: 2,
	name: 'Captures',
	redirectUrl: null,
	links: { site: null, repository: null },
	descriptionHtml: '',
	moderators: new Map(),
	numTopics: 0,
	sortBy: 'lastPost',
	topicPermission: null,
	isSubscribed: false,
};

function data(overrides: Partial<FakeData> = {}): FakeData {
	return {
		users: [{ viewer: guest }, { viewer: viewer() }],
		topics: [topic({ id: 10, subject: 'Postez un « vintage »' })],
		posts: new Map([[10, [post(100)]]]),
		forumInfos: [forumInfo],
		drafts: [
			draft(),
			draft({ id: 6, subject: '', topicId: 10, forum: { id: 1, name: 'Forum' } }),
			draft({ id: 7, posterId: 5, subject: 'Pas à moi' }),
		],
		...overrides,
	};
}

let app: ForumApp | undefined;

async function submit(server: ForumApp, page: string, action: string, fields: Record<string, string>) {
	const form = await inject(server, { url: page, headers: { cookie: tessy } });
	const csrf =
		[form.headers['set-cookie']]
			.flat()
			.find((c) => c?.startsWith('avrobb_csrf='))
			?.split(';')[0] ?? '';
	const token = /name="csrf_token" value="([0-9a-f]+)"/.exec(form.body)?.[1] ?? '';
	return inject(server, {
		method: 'POST',
		url: action,
		headers: { cookie: `${tessy}; ${csrf}`, 'content-type': 'application/x-www-form-urlencoded' },
		payload: new URLSearchParams({ csrf_token: token, ...fields }).toString(),
	});
}

describe('post.php et brouillons', () => {
	it('enregistre comme brouillon au lieu de publier', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const res = await submit(app, '/post.php?fid=2', '/post.php?action=post&fid=2', {
			form_sent: '1',
			req_subject: 'Récit',
			req_message: 'Texte [I]à finir[/I]',
			brouillon: '1',
		});
		expect(res.statusCode).toBe(302);
		expect(res.headers.location).toBe('/draft_list.php?id=701');
		expect(fake.createdDrafts).toEqual([
			{ poster: 'Tessy', posterId: 3, subject: 'Récit', message: 'Texte [i]à finir[/i]', posted: NOW, topicId: null, forumId: 2 },
		]);
		expect(fake.savedTopics).toBeUndefined();
	});

	it('reprend un brouillon en prévisualisation, puis le supprime une fois publié', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const page = await inject(app, { url: '/post.php?id=6&brouillon=1', headers: { cookie: tessy } });
		expect(page.statusCode).toBe(200);
		expect(page.body).toContain('action="/post.php?action=post&amp;tid=10"');
		expect(page.body).toContain('<strong>Brouillon</strong> du récit');
		expect(page.body).toContain('name="brouillon_id" value="6"');

		const res = await submit(app, '/post.php?tid=10', '/post.php?action=post&tid=10', {
			form_sent: '1',
			req_message: 'Version finale',
			brouillon_id: '6',
		});
		expect(res.statusCode).toBe(302);
		expect(fake.savedReplies).toHaveLength(1);
		expect(fake.drafts?.map((d) => d.id)).toEqual([5, 7]);
	});

	it('refuse le brouillon d’un autre ou inconnu', async () => {
		app = await buildApp(fakeDeps(data()));
		expect((await inject(app, { url: '/post.php?id=7&brouillon=1', headers: { cookie: tessy } })).statusCode).toBe(403);
		expect((await inject(app, { url: '/post.php?id=99&brouillon=1', headers: { cookie: tessy } })).statusCode).toBe(404);
		expect((await inject(app, '/post.php?id=5&brouillon=1')).statusCode).toBe(404);
	});
});

describe('« Poster » depuis la liste des brouillons', () => {
	it('publie directement le brouillon (POST) et le retire de la liste', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const list = await inject(app, { url: '/draft_list.php?id=6', headers: { cookie: tessy } });
		expect(list.body).toContain('<form class="inline-form" method="post" action="/post.php?id=6&amp;brouillon=1">');
		const res = await submit(app, '/draft_list.php?id=6', '/post.php?id=6&brouillon=1', {});
		expect(res.statusCode).toBe(302);
		expect(res.headers.location).toBe('/message/901#p901');
		expect(fake.savedReplies?.[0]).toMatchObject({ topicId: 10, message: '[b]Brouillon[/b] du récit' });
		expect(fake.drafts?.map((d) => d.id)).toEqual([5, 7]);
	});

	it('réaffiche le formulaire en cas d’erreur, sans publier', async () => {
		const fake = data({ drafts: [draft({ id: 6, subject: '', topicId: 10, message: '[b]non fermé' })] });
		app = await buildApp(fakeDeps(fake));
		const res = await submit(app, '/draft_list.php?id=6', '/post.php?id=6&brouillon=1', {});
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('La balise [b] a été trouvée sans balise [/b] correspondante');
		expect(fake.savedReplies).toBeUndefined();
		expect(fake.drafts).toHaveLength(1);
	});

	it('refuse le brouillon d’un autre', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const res = await submit(app, '/draft_list.php', '/post.php?id=7&brouillon=1', {});
		expect(res.statusCode).toBe(403);
		expect(fake.savedReplies).toBeUndefined();
	});
});

describe('draft_list.php', () => {
	it('liste les brouillons du membre et ouvre l’un d’eux', async () => {
		app = await buildApp(fakeDeps(data()));
		const res = await inject(app, { url: '/draft_list.php?id=5', headers: { cookie: tessy } });
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('Mon vol de nuit');
		expect(res.body).not.toContain('Pas à moi');
		expect(res.body).toContain('<strong>Brouillon</strong> du récit');
		expect(res.body).toContain('action="/post.php?id=5&amp;brouillon=1"');
		expect(res.body).toContain('href="/draft_edit.php?id=5"');
		expect((await inject(app, { url: '/draft_list.php?id=7', headers: { cookie: tessy } })).statusCode).toBe(403);
	});

	it('renvoie un invité vers la connexion', async () => {
		app = await buildApp(fakeDeps(data()));
		const res = await inject(app, '/draft_list.php');
		expect(res.statusCode).toBe(302);
		expect(res.headers.location).toBe('/connexion');
	});

	it('supprime après confirmation, seulement ses propres brouillons', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const confirm = await inject(app, { url: '/draft_list.php?action=delete&id=5', headers: { cookie: tessy } });
		expect(confirm.body).toContain('Etes-vous sûr de vouloir supprimer le message');
		const res = await submit(app, '/draft_list.php?action=delete&id=5', '/draft_list.php', {
			action: 'delete',
			id: '5',
			delete_comply: '1',
		});
		expect(res.headers.location).toBe('/draft_list.php');
		await submit(app, '/draft_list.php', '/draft_list.php', { action: 'delete', id: '7', delete_comply: '1' });
		expect(fake.drafts?.map((d) => d.id)).toEqual([6, 7]);
	});
});

describe('draft_edit.php', () => {
	it('modifie le sujet et le texte d’un brouillon de discussion', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const page = await inject(app, { url: '/draft_edit.php?id=5', headers: { cookie: tessy } });
		expect(page.body).toContain('value="Mon vol de nuit"');
		const res = await submit(app, '/draft_edit.php?id=5', '/draft_edit.php?id=5&action=edit', {
			form_sent: '1',
			req_subject: 'Vol de nuit',
			req_message: 'Texte [B]revu[/B]',
		});
		expect(res.headers.location).toBe('/draft_list.php?id=5');
		expect(fake.drafts?.find((d) => d.id === 5)).toMatchObject({ subject: 'Vol de nuit', message: 'Texte [b]revu[/b]' });
	});

	it('brouillon de réponse : pas de sujet ; brouillon d’un autre refusé', async () => {
		app = await buildApp(fakeDeps(data()));
		expect((await inject(app, { url: '/draft_edit.php?id=6', headers: { cookie: tessy } })).body).not.toContain('name="req_subject"');
		expect((await inject(app, { url: '/draft_edit.php?id=7', headers: { cookie: tessy } })).statusCode).toBe(403);
	});

	it('limitation de débit des écritures, comme la publication : 429 au-delà', async () => {
		const fake = data();
		app = await buildApp({ ...fakeDeps(fake), writeRateLimiter: { limit: async () => ({ success: false }) } });
		const fields = { form_sent: '1', req_subject: 'Vol de nuit', req_message: 'Texte' };
		expect((await submit(app, '/draft_edit.php?id=5', '/draft_edit.php?id=5&action=edit', fields)).statusCode).toBe(429);
		expect((await submit(app, '/draft_list.php', '/draft_list.php', { delete: '1', 'drafts[]': '5' })).statusCode).toBe(429);
		expect(fake.drafts?.find((d) => d.id === 5)).toMatchObject({ subject: 'Mon vol de nuit' });
	});
});
