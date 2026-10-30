/**
 * Complètement des noms de membres (member_suggest.php) et marquage des champs pour public/js/mentions.js.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { type FakeData, fakeDeps, group, guest, NOW, sessionCookie, topic, viewer } from './fixtures.ts';

const SEED = 'graine-de-test';
const tessy = viewer();
const max = viewer({ id: 5, username: 'MaxDUO' });
const hidden = viewer({ id: 6, username: 'Discret', group: group({ id: 6, canViewUsers: false }) });
const hashes: Record<number, string> = { 3: 'h3', 5: 'h5', 6: 'h6' };
const cookie = (userId: number): string => `${sessionCookie(userId)}`;

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

async function start(): Promise<FastifyInstance> {
	const fake: FakeData = {
		users: [{ viewer: guest }, { viewer: tessy }, { viewer: max }, { viewer: hidden }],
		topics: [topic({ id: 10 })],
		posts: new Map([[10, []]]),
	};
	app = await buildApp(fakeDeps(fake));
	return app;
}

describe('member_suggest.php', () => {
	it('membres dont le nom commence par le texte saisi', async () => {
		const server = await start();
		const res = await server.inject({ url: '/member_suggest.php?q=ma', headers: { cookie: cookie(3) } });
		expect(res.headers['content-type']).toContain('application/json');
		expect(res.json()).toEqual({ members: [{ id: 5, username: 'MaxDUO' }] });
		expect((await server.inject({ url: '/member_suggest.php?q=%20', headers: { cookie: cookie(3) } })).json()).toEqual({ members: [] });
	});

	it('refusé aux invités et aux groupes sans accès à la liste des membres', async () => {
		const server = await start();
		expect((await server.inject('/member_suggest.php?q=ma')).statusCode).toBe(403);
		expect((await server.inject({ url: '/member_suggest.php?q=ma', headers: { cookie: cookie(6) } })).statusCode).toBe(403);
	});

	it('script et adresse des profils chargés pour un membre seulement', async () => {
		const server = await start();
		const member = await server.inject({ url: '/viewtopic.php?id=10', headers: { cookie: cookie(3) } });
		expect(member.body).toContain('js/mentions.js');
		expect(member.body).toMatch(/data-profile-base="[^"]*\/profile\.php\?id="/);
		expect(member.body).toContain('data-mentions');
		expect((await server.inject('/viewtopic.php?id=10')).body).not.toContain('mentions.js');
	});
});
