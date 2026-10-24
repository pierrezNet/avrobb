import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { GroupId } from '../src/domain/models.ts';
import { forumHmac } from '../src/services/legacySession.ts';
import { type FakeData, fakeDeps, group, guest, NOW, post, topic, viewer } from './fixtures.ts';

const SEED = 'graine-de-test';
const tessy = viewer();
const admin = viewer({ id: 2, username: 'admin', group: group({ id: GroupId.Admin, title: 'Administrateurs' }) });

function data(overrides: Partial<FakeData> = {}): FakeData {
	return {
		users: [
			{ viewer: guest, passwordHash: '' },
			{ viewer: tessy, passwordHash: 'hash-tessy' },
			{ viewer: admin, passwordHash: 'hash-admin' },
		],
		topics: [topic({ id: 10, subject: '<script>alert(1)</script>' })],
		posts: new Map([[10, [post(100), post(101, { message: '[b]gras[/b] <img src=x onerror=alert(1)>' })]]]),
		...overrides,
	};
}

function sessionCookie(userId: number, passwordHash: string): string {
	const expires = NOW + 3600;
	return `punbb_cookie=${userId}|${forumHmac(passwordHash, `${SEED}_password_hash`)}|${expires}|${forumHmac(`${userId}|${expires}`, `${SEED}_cookie_hash`)}`;
}

let app: FastifyInstance;
afterEach(async () => app.close());

describe('GET /viewtopic.php', () => {
	it('affiche le sujet à un invité, en échappant le sujet et les messages', async () => {
		app = await buildApp(fakeDeps(data()));
		const res = await app.inject('/viewtopic.php?id=10');

		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(res.body).not.toContain('<script>alert(1)');
		expect(res.body).toContain('<strong>gras</strong>');
		expect(res.body).not.toContain('<img src=x');
		expect(res.body).toContain('Vous n&#39;êtes pas identifié(e).');
		expect(res.body).not.toContain('class="postdelete"');
	});

	it('renvoie 404 pour un sujet inexistant ou un forum non lisible par le groupe', async () => {
		app = await buildApp(fakeDeps(data({ forumReaders: new Map([[1, [GroupId.Admin]]]) })));

		expect((await app.inject('/viewtopic.php?id=999')).statusCode).toBe(404);
		expect((await app.inject('/viewtopic.php?id=10')).statusCode).toBe(404);
		expect((await app.inject({ url: '/viewtopic.php?id=10', headers: { cookie: sessionCookie(2, 'hash-admin') } })).statusCode).toBe(200);
	});

	it('reconnaît le cookie de session PHP et ignore un cookie falsifié', async () => {
		app = await buildApp(fakeDeps(data()));

		const valid = await app.inject({ url: '/viewtopic.php?id=10', headers: { cookie: sessionCookie(3, 'hash-tessy') } });
		expect(valid.body).toContain('<strong>Tessy</strong>');
		expect(valid.body).toContain('id="navlogout"');
		expect(valid.body).toContain('class="postedit"');

		const forged = await app.inject({ url: '/viewtopic.php?id=10', headers: { cookie: sessionCookie(2, 'mauvais-hash') } });
		expect(forged.body).toContain('Vous n&#39;êtes pas identifié(e).');
	});

	it('redirige ?pid= vers la bonne page du sujet', async () => {
		const many = Array.from({ length: 30 }, (_, i) => post(200 + i));
		app = await buildApp(fakeDeps(data({ topics: [topic({ id: 20, numReplies: 29, firstPostId: 200 })], posts: new Map([[20, many]]) })));

		const res = await app.inject('/viewtopic.php?pid=227');
		expect(res.statusCode).toBe(302);
		expect(res.headers.location).toBe('viewtopic.php?id=20&p=2#p227');
	});

	it('pagine et renvoie vers le PHP pour les pages non portées', async () => {
		const many = Array.from({ length: 30 }, (_, i) => post(200 + i));
		app = await buildApp(fakeDeps(data({ topics: [topic({ id: 20, numReplies: 29, firstPostId: 200 })], posts: new Map([[20, many]]) })));

		const res = await app.inject('/viewtopic.php?id=20&p=2');
		expect(res.body).toContain('id="p225"');
		expect(res.body).not.toContain('id="p224"');
		expect(res.body).toContain('<strong aria-current="page">2</strong>');
		expect(res.body).toContain('href="http://php.test/viewforum.php?id=1"');
		expect(res.body).toContain('href="viewtopic.php?id=20"');
	});
});

describe('gestion des erreurs', () => {
	it('renvoie une page 500 générique, sans détail technique', async () => {
		const deps = fakeDeps(data());
		app = await buildApp({
			...deps,
			posts: {
				listPage: async () => {
					throw new Error("SELECT * FROM fo_posts : Table 'secret' doesn't exist");
				},
			},
		});

		const res = await app.inject('/viewtopic.php?id=10');
		expect(res.statusCode).toBe(500);
		expect(res.headers['content-type']).toContain('text/html');
		expect(res.body).toContain('Une erreur est survenue');
		expect(res.body).not.toContain('fo_posts');
		expect(res.body).toContain('id="brdmenu"');
	});

	it('se contente de la mise en page minimale si la base est indisponible', async () => {
		const deps = fakeDeps(data());
		app = await buildApp({
			...deps,
			config: {
				load: async () => {
					throw new Error('connect ECONNREFUSED 127.0.0.1:3307');
				},
			},
		});

		const res = await app.inject('/viewtopic.php?id=10');
		expect(res.statusCode).toBe(500);
		expect(res.body).toContain('Une erreur est survenue');
		expect(res.body).not.toContain('ECONNREFUSED');
	});

	it('rend les URL inconnues en 404 dans la mise en page', async () => {
		app = await buildApp(fakeDeps(data()));
		const res = await app.inject('/inconnu');
		expect(res.statusCode).toBe(404);
		expect(res.body).toContain('Le lien que vous avez suivi est incorrect');
	});
});

describe('viewtopic : contenu propre à PV', () => {
	const label = { id: 1, name: 'Réglé', style: 'brackets' as const, color: '#00AA00', bold: true, italic: false, underline: false };

	it('préfixe le sujet de ses balises et applique la censure partout', async () => {
		app = await buildApp(
			fakeDeps(
				data({
					topics: [topic({ id: 10, subject: 'Panne de zut' })],
					posts: new Map([
						[10, [post(100, { message: 'zut alors :)', author: { ...post(1).author!, location: 'Zutville', title: 'zut' } })]],
					]),
					config: { censoring: true },
					censoredWords: [{ searchFor: 'zut', replaceWith: '***' }],
					topicLabels: new Map([[10, [label]]]),
				}),
			),
		);

		const res = await app.inject('/viewtopic.php?id=10');
		expect(res.body).toContain('<title>[Réglé] Panne de *** (Page 1) / Forum / Forum de test</title>');
		expect(res.body).toContain('<h1 class="page-title">[Réglé] Panne de ***</h1>');
		expect(res.body).toContain('*** alors <span class="smiley" role="img" aria-label="smile">🙂</span>');
		expect(res.body).toContain('<p class="post__usertitle">***</p>');
		expect(res.body).not.toContain('zut');
	});

	it('titre « En vacances » des bannis, renommée et lien MP', async () => {
		app = await buildApp(
			fakeDeps(
				data({
					posts: new Map([
						[10, [post(100, { author: { ...post(1).author!, reputationPlus: 5, reputationMinus: 2, url: 'javascript:alert(1)' } })]],
					]),
					bannedUsernames: ['tessy'],
					config: { reputationEnabled: true, privateMessagesEnabled: true },
				}),
			),
		);

		const asAdmin = await app.inject({ url: '/viewtopic.php?id=10', headers: { cookie: sessionCookie(2, 'hash-admin') } });
		expect(asAdmin.body).toContain('<p class="post__usertitle">En vacances</p>');
		expect(asAdmin.body).toContain('<strong>3</strong>');
		expect(asAdmin.body).toContain('reputation.php?pid=100&amp;uid=3&amp;method=1');
		expect(asAdmin.body).toContain('pms_send.php?uid=3');
		expect(asAdmin.body).toContain('href="http://javascript:alert(1)"');

		// L'auteur voit sa renommée mais ne peut pas voter pour lui-même.
		const asAuthor = await app.inject({ url: '/viewtopic.php?id=10', headers: { cookie: sessionCookie(3, 'hash-tessy') } });
		expect(asAuthor.body).toContain('<strong>3</strong>');
		expect(asAuthor.body).not.toContain('method=1');
	});
});
