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
		expect(res.body).toContain('Vous n&#39;êtes pas connecté(e).');
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
		expect(valid.body).toContain('Connecté(e) en tant que <strong>Tessy</strong>');
		expect(valid.body).toContain('class="postedit"');

		const forged = await app.inject({ url: '/viewtopic.php?id=10', headers: { cookie: sessionCookie(2, 'mauvais-hash') } });
		expect(forged.body).toContain('Vous n&#39;êtes pas connecté(e).');
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
		expect(res.body).toContain('<strong>2</strong>');
		expect(res.body).toContain('href="http://php.test/viewforum.php?id=1"');
		expect(res.body).toContain('href="viewtopic.php?id=20"');
	});
});
