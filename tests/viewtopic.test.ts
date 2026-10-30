import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { GroupId } from '../src/domain/models.ts';
import { boardConfig, type FakeData, fakeDeps, group, guest, NOW, post, sessionCookie, topic, viewer } from './fixtures.ts';

const tessy = viewer();
const admin = viewer({ id: 2, username: 'admin', group: group({ id: GroupId.Admin, title: 'Administrateurs' }) });

function data(overrides: Partial<FakeData> = {}): FakeData {
	return {
		users: [{ viewer: guest }, { viewer: tessy }, { viewer: admin }],
		topics: [topic({ id: 10, subject: '<script>alert(1)</script>' })],
		posts: new Map([[10, [post(100, { posted: NOW - 600 }), post(101, { message: '[b]gras[/b] <img src=x onerror=alert(1)>' })]]]),
		...overrides,
	};
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
		expect((await app.inject({ url: '/viewtopic.php?id=10', headers: { cookie: sessionCookie(2) } })).statusCode).toBe(200);
	});

	it('reconnaît le cookie de session PHP et ignore un cookie falsifié', async () => {
		app = await buildApp(fakeDeps(data()));

		const valid = await app.inject({ url: '/viewtopic.php?id=10', headers: { cookie: sessionCookie(3) } });
		expect(valid.body).toContain('<strong>Tessy</strong>');
		expect(valid.body).toContain('id="navlogout"');
		expect(valid.body).toContain('class="postedit"');

		const forged = await app.inject({
			url: '/viewtopic.php?id=10',
			headers: { cookie: sessionCookie(2).replace(/.$/, (last) => (last === '0' ? '1' : '0')) },
		});
		expect(forged.body).toContain('Vous n&#39;êtes pas identifié(e).');
	});

	it('redirige ?pid= vers la bonne page du sujet', async () => {
		const many = Array.from({ length: 30 }, (_, i) => post(200 + i));
		app = await buildApp(fakeDeps(data({ topics: [topic({ id: 20, numReplies: 29, firstPostId: 200 })], posts: new Map([[20, many]]) })));

		const res = await app.inject('/viewtopic.php?pid=227');
		expect(res.statusCode).toBe(302);
		expect(res.headers.location).toBe('viewtopic.php?id=20&p=2#p227');
	});

	it('pagine, avec les liens des pages portées en local', async () => {
		const many = Array.from({ length: 30 }, (_, i) => post(200 + i));
		app = await buildApp(fakeDeps(data({ topics: [topic({ id: 20, numReplies: 29, firstPostId: 200 })], posts: new Map([[20, many]]) })));

		const res = await app.inject({ url: '/viewtopic.php?id=20&p=2', headers: { cookie: sessionCookie(3) } });
		expect(res.body).toContain('id="p225"');
		expect(res.body).not.toContain('id="p224"');
		expect(res.body).toContain('<strong aria-current="page">2</strong>');
		expect(res.body).toContain('href="viewforum.php?id=1"');
		expect(res.body).toContain('href="profile.php?id=3"');
		expect(res.body).toContain('action="post.php?action=post&amp;tid=20"');
		expect(res.body).toContain('href="viewtopic.php?id=20"');
	});

	it('pas de bouton « Répondre » quand le formulaire de réponse est en bas de page', async () => {
		app = await buildApp(fakeDeps(data()));
		const withForm = await app.inject({ url: '/viewtopic.php?id=10', headers: { cookie: sessionCookie(3) } });
		expect(withForm.body).toContain('id="quickpostform"');
		expect(withForm.body).not.toContain('href="post.php?tid=10"');
		await app.close();
		app = await buildApp(fakeDeps(data({ config: { posting: { ...boardConfig.posting, quickpost: false } } })));
		const withoutForm = await app.inject({ url: '/viewtopic.php?id=10', headers: { cookie: sessionCookie(3) } });
		expect(withoutForm.body).not.toContain('id="quickpostform"');
		expect(withoutForm.body).toContain('href="post.php?tid=10"');
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

describe('viewtopic : balises et censure', () => {
	it('balise du sujet en pastille, censure appliquée partout', async () => {
		app = await buildApp(
			fakeDeps(
				data({
					topics: [topic({ id: 10, subject: '[MSFS] Panne de zut' })],
					posts: new Map([
						[10, [post(100, { message: 'zut alors :)', author: { ...post(1).author!, location: 'Zutville', title: 'zut' } })]],
					]),
					config: { censoring: true },
					censoredWords: [{ searchFor: 'zut', replaceWith: '***' }],
				}),
			),
		);

		const res = await app.inject('/viewtopic.php?id=10');
		expect(res.body).toContain('<title>[MSFS] Panne de *** (Page 1) / Forum / Forum de test</title>');
		expect(res.body).toContain(
			'<h1 class="page-title"><span class="subject-tag" style="background-color: #1d4ed8; color: #ffffff">MSFS</span><span class="subject-tag-gap">&#160;</span>Panne de ***</h1>',
		);
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

		const asAdmin = await app.inject({ url: '/viewtopic.php?id=10', headers: { cookie: sessionCookie(2) } });
		expect(asAdmin.body).toContain('<p class="post__usertitle">En vacances</p>');
		expect(asAdmin.body).toContain('<strong>3</strong>');
		expect(asAdmin.body).toContain('reputation.php?pid=100&amp;uid=3&amp;method=1');
		expect(asAdmin.body).toContain('pms_send.php?uid=3');
		expect(asAdmin.body).toContain('href="http://javascript:alert(1)"');

		// L'auteur voit sa renommée mais ne peut pas voter pour lui-même.
		const asAuthor = await app.inject({ url: '/viewtopic.php?id=10', headers: { cookie: sessionCookie(3) } });
		expect(asAuthor.body).toContain('<strong>3</strong>');
		expect(asAuthor.body).not.toContain('method=1');
	});
});

describe('réponse rapide (o_quickpost)', () => {
	it('proposée au membre qui peut répondre, avec l’abonnement conservé', async () => {
		app = await buildApp(fakeDeps(data({ subscribedTopics: [10] })));
		const res = await app.inject({ url: '/viewtopic.php?id=10', headers: { cookie: sessionCookie(3) } });
		expect(res.body).toContain('id="quickpostform"');
		expect(res.body).toContain('action="post.php?action=post&amp;tid=10"');
		expect(res.body).toMatch(/name="csrf_token" value="[0-9a-f]{64}"/);
		expect(res.body).toContain('<input type="hidden" name="subscribe" value="1">');
		expect(res.body).not.toContain('name="req_username"');
	});

	it('invité autorisé : pseudo et e-mail ; sinon, pas de formulaire', async () => {
		app = await buildApp(fakeDeps(data()));
		expect((await app.inject('/viewtopic.php?id=10')).body).not.toContain('quickpostform');
		await app.close();

		app = await buildApp(fakeDeps(data({ topics: [topic({ id: 10, forumReplyPermission: true })] })));
		const res = await app.inject('/viewtopic.php?id=10');
		expect(res.body).toContain('id="quickpostform"');
		expect(res.body).toContain('name="req_email"');
		expect(res.body).not.toContain('name="subscribe"');
	});

	it('fermée sur un sujet clos, sauf pour un modérateur ; absente si désactivée', async () => {
		app = await buildApp(fakeDeps(data({ topics: [topic({ id: 10, closed: true })] })));
		expect((await app.inject({ url: '/viewtopic.php?id=10', headers: { cookie: sessionCookie(3) } })).body).not.toContain('quickpostform');
		expect((await app.inject({ url: '/viewtopic.php?id=10', headers: { cookie: sessionCookie(2) } })).body).toContain('quickpostform');
		await app.close();

		app = await buildApp(fakeDeps(data({ config: { posting: { ...boardConfig.posting, quickpost: false } } })));
		expect((await app.inject({ url: '/viewtopic.php?id=10', headers: { cookie: sessionCookie(3) } })).body).not.toContain('quickpostform');
	});
});
