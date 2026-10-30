/**
 * Suivi des sujets lus (cookie <cookie>_track), compteur de vues et « marquer comme lu » (misc.php).
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { markRead, parseTrackedTopics, serializeTrackedTopics } from '../src/services/trackedTopics.ts';
import { fakeDeps, fakeOnline, guest, NOW, post, sessionCookie, topic, viewer } from './fixtures.ts';

describe('serializeTrackedTopics (set_tracked_topics())', () => {
	it('sujets puis forums, du plus récent au plus ancien, relisible', () => {
		const tracked = markRead(parseTrackedTopics('t10=100;t11=300;f2=200;'), 'topics', 12, 250);
		expect(serializeTrackedTopics(tracked)).toBe('t11=300;t12=250;t10=100;f2=200;');
		expect(parseTrackedTopics(serializeTrackedTopics(tracked)).topics.get(12)).toBe(250);
	});

	it('tronqué à 4048 octets sur une entrée complète', () => {
		const topics = new Map(Array.from({ length: 400 }, (_, i) => [i + 1, 1_700_000_000 + i] as [number, number]));
		const data = serializeTrackedTopics({ topics, forums: new Map() });
		expect(data.length).toBeLessThanOrEqual(4048);
		expect(data.endsWith(';')).toBe(true);
	});
});

const cookie = (extra = ''): string => `${sessionCookie(3)}${extra}`;
const setCookie = (header: string | string[] | undefined, name: string): string | undefined =>
	[header].flat().find((c) => c?.startsWith(`${name}=`));

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

describe('viewtopic : suivi et vues', () => {
	const tessy = viewer({ lastVisit: NOW - 5000 });
	const posts = [post(100, { posted: NOW - 9000 }), post(101, { posted: NOW - 4000 }), post(102, { posted: NOW - 100 })];
	const data = () => ({
		users: [{ viewer: guest }, { viewer: tessy, presence: { logged: NOW - 60, idle: false } }],
		topics: [topic({ id: 10, numReplies: 2 })],
		posts: new Map([[10, posts]]),
	});

	it('marque le sujet lu dans le cookie et compte la vue', async () => {
		const d = data();
		app = await buildApp(fakeDeps(d));
		const res = await app.inject({ url: '/viewtopic.php?id=10', headers: { cookie: cookie('; avrobb_track=t4=123;') } });

		expect(setCookie(res.headers['set-cookie'], 'avrobb_track')).toContain(`avrobb_track=t10%3D${NOW}%3Bt4%3D123%3B`);
		expect(d).toHaveProperty('viewedTopics', [10]);

		// Un invité compte une vue mais n'a pas de suivi.
		const asGuest = await app.inject('/viewtopic.php?id=10');
		expect(setCookie(asGuest.headers['set-cookie'], 'avrobb_track')).toBeUndefined();
	});

	it('action=new : premier message après la dernière lecture, sinon après la dernière visite', async () => {
		app = await buildApp(fakeDeps(data()));
		const fromVisit = await app.inject({ url: '/viewtopic.php?id=10&action=new', headers: { cookie: cookie() } });
		expect(fromVisit.headers.location).toBe('viewtopic.php?pid=101#p101');

		const fromTracking = await app.inject({
			url: '/viewtopic.php?id=10&action=new',
			headers: { cookie: cookie(`; avrobb_track=t10=${NOW - 2000};`) },
		});
		expect(fromTracking.headers.location).toBe('viewtopic.php?pid=102#p102');

		const nothingNew = await app.inject({
			url: '/viewtopic.php?id=10&action=new',
			headers: { cookie: cookie(`; avrobb_track=t10=${NOW};`) },
		});
		expect(nothingNew.headers.location).toBe('viewtopic.php?id=10&action=last');
		expect((await app.inject('/viewtopic.php?id=10&action=new')).headers.location).toBe('viewtopic.php?id=10&action=last');
	});
});

describe('misc.php', () => {
	const tessy = viewer({ logged: NOW - 700 });
	const deps = (config = {}) =>
		fakeDeps({
			users: [{ viewer: guest }, { viewer: tessy, presence: { logged: NOW - 700, idle: false } }],
			topics: [],
			posts: new Map(),
			config,
		});

	it('un ancien lien GET « marquer comme lu » demande confirmation, sans rien écrire', async () => {
		const online = fakeOnline();
		app = await buildApp({ ...deps(), online });
		const res = await app.inject({ url: '/misc.php?action=markread', headers: { cookie: cookie() } });
		expect(res.body).toContain('<form class="message-box" method="post" action="misc.php?action=markread">');
		expect(online.log).toEqual([]);
		expect((await app.inject('/misc.php?action=markread')).statusCode).toBe(403);
	});

	it('POST marquer comme lu : last_visit et suivi remis à zéro ; un forum : marqué dans le cookie', async () => {
		const online = fakeOnline();
		app = await buildApp({ ...deps(), online });
		const page = await app.inject({ url: '/misc.php?action=markread', headers: { cookie: cookie() } });
		const csrf = setCookie(page.headers['set-cookie'], 'avrobb_csrf')?.split(';')[0] ?? '';
		const token = /name="csrf_token" value="([0-9a-f]+)"/.exec(page.body)?.[1] ?? '';
		const send = (url: string) =>
			app?.inject({
				method: 'POST',
				url,
				headers: { cookie: `${cookie()}; ${csrf}`, 'content-type': 'application/x-www-form-urlencoded' },
				payload: `csrf_token=${token}`,
			});

		const all = await send('/misc.php?action=markread');
		expect(all?.headers.location).toBe('index.php');
		expect(online.log).toContain(`last_visit 3 ${NOW - 700}`);
		expect(setCookie(all?.headers['set-cookie'], 'avrobb_track')).toMatch(/^avrobb_track=;/);

		const forum = await send('/misc.php?action=markforumread&fid=2');
		expect(forum?.headers.location).toBe('viewforum.php?id=2');
		expect(setCookie(forum?.headers['set-cookie'], 'avrobb_track')).toContain(`f2%3D${NOW}`);
	});

	it('règles affichées si activées ; action inconnue refusée', async () => {
		app = await buildApp(deps({ rules: true }));
		expect((await app.inject('/misc.php?action=rules')).body).toContain('<p>Soyez <em>courtois</em>.</p>');
		expect((await app.inject('/misc.php?action=autre')).statusCode).toBe(400);
		await app.close();
		app = await buildApp(deps());
		expect((await app.inject('/misc.php?action=rules')).statusCode).toBe(404);
	});
});
