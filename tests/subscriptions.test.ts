/**
 * Abonnements aux sujets et forums (misc.php?action=subscribe|unsubscribe) : bouton POST dans
 * viewtopic et viewforum, confirmation d'un lien GET, contrôles de misc.php.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import type { ForumInfo } from '../src/domain/models.ts';
import { boardConfig, type FakeData, fakeDeps, guest, NOW, post, sessionCookie, topic, viewer } from './fixtures.ts';

const tessy = `${sessionCookie(3)}`;
const forumInfo: ForumInfo = {
	id: 2,
	name: 'Captures',
	redirectUrl: null,
	moderators: new Map(),
	numTopics: 0,
	sortBy: 'lastPost',
	topicPermission: null,
	isSubscribed: false,
};

function data(overrides: Partial<FakeData> = {}): FakeData {
	return {
		users: [{ viewer: guest }, { viewer: viewer() }],
		topics: [topic({ id: 10 })],
		posts: new Map([[10, [post(100)]]]),
		forumInfos: [forumInfo],
		...overrides,
	};
}

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

/** Envoie le formulaire de confirmation affiché par le lien GET. */
async function confirm(server: FastifyInstance, url: string) {
	const page = await server.inject({ url, headers: { cookie: tessy } });
	const csrf =
		[page.headers['set-cookie']]
			.flat()
			.find((c) => c?.startsWith('avrobb_csrf='))
			?.split(';')[0] ?? '';
	const token = /name="csrf_token" value="([0-9a-f]+)"/.exec(page.body)?.[1] ?? '';
	const action = /<form class="message-box" method="post" action="([^"]+)"/.exec(page.body)?.[1]?.replaceAll('&amp;', '&') ?? '';
	return {
		page,
		res: await server.inject({
			method: 'POST',
			url: `/${action}`,
			headers: { cookie: `${tessy}; ${csrf}`, 'content-type': 'application/x-www-form-urlencoded' },
			payload: `csrf_token=${token}`,
		}),
	};
}

describe('abonnements', () => {
	it('viewtopic propose un bouton POST selon l’abonnement', async () => {
		app = await buildApp(fakeDeps(data()));
		const res = await app.inject({ url: '/viewtopic.php?id=10', headers: { cookie: tessy } });
		expect(res.body).toContain('action="misc.php?action=subscribe&amp;tid=10"');
		await app.close();
		app = await buildApp(fakeDeps(data({ subscribedTopics: [10] })));
		const subscribed = await app.inject({ url: '/viewtopic.php?id=10', headers: { cookie: tessy } });
		expect(subscribed.body).toContain('Vous suivez cette discussion');
		expect(subscribed.body).toContain('action="misc.php?action=unsubscribe&amp;tid=10"');
		expect((await app.inject('/viewtopic.php?id=10')).body).not.toContain('action=subscribe');
	});

	it('un lien GET demande confirmation, puis le POST abonne et revient au sujet', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const { page, res } = await confirm(app, '/misc.php?action=subscribe&tid=10');
		expect(page.body).toContain('Vous serez prévenu(e) par e-mail des nouvelles réponses');
		expect(fake.subscribedTopics).toEqual([10]);
		expect(res.statusCode).toBe(303);
		expect(res.headers.location).toBe('viewtopic.php?id=10');
	});

	it('désabonnement d’un forum (lien des e-mails)', async () => {
		const fake = data({ subscribedForums: [2] });
		app = await buildApp(fakeDeps(fake));
		const { res } = await confirm(app, '/misc.php?action=unsubscribe&fid=2');
		expect(res.headers.location).toBe('viewforum.php?id=2');
		expect(fake.subscribedForums).toEqual([]);
	});

	it('contrôles de misc.php : invité, déjà abonné, pas abonné, cible inconnue, option désactivée', async () => {
		app = await buildApp(fakeDeps(data({ subscribedTopics: [10] })));
		const get = async (url: string, cookie = tessy) => app?.inject({ url, headers: { cookie } });
		expect((await get('/misc.php?action=subscribe&tid=10', ''))?.statusCode).toBe(403);
		expect((await get('/misc.php?action=subscribe&tid=10'))?.body).toContain('Vous suivez déjà cette discussion.');
		expect((await get('/misc.php?action=unsubscribe&fid=2'))?.body).toContain('Vous ne suivez pas ce forum.');
		expect((await get('/misc.php?action=subscribe&tid=99'))?.statusCode).toBe(404);
		expect((await get('/misc.php?action=subscribe'))?.statusCode).toBe(400);
		await app.close();
		app = await buildApp(fakeDeps(data({ config: { ...boardConfig, forumSubscriptions: false } })));
		expect((await app.inject({ url: '/misc.php?action=subscribe&fid=2', headers: { cookie: tessy } })).statusCode).toBe(403);
	});

	it('refuse un POST sans jeton CSRF', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const res = await app.inject({ method: 'POST', url: '/misc.php?action=subscribe&tid=10', headers: { cookie: tessy } });
		expect(res.statusCode).toBe(403);
		expect(fake.subscribedTopics).toBeUndefined();
	});
});
