/**
 * Utilisateurs dans l'administration (admin_users.php) : critères de recherche
 * (services/userSearch.ts) et pages de bout en bout avec les doublures.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { GroupId } from '../src/domain/models.ts';
import { buildLegacyCookie } from '../src/services/legacySession.ts';
import { parseAdminDate, readUserSearch } from '../src/services/userSearch.ts';
import { type FakeData, fakeDeps, group, guest, NOW, viewer } from './fixtures.ts';

const SEED = 'graine-de-test';
const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true }) });
const tessy = viewer();
const hashes: Record<number, string> = { 5: 'h5', 3: 'h3' };
const cookie = (userId: number): string => `punbb_cookie=${buildLegacyCookie(userId, hashes[userId] ?? '', NOW + 3600, SEED)}`;

describe('critères de recherche', () => {
	it('motifs avec joker, nombres, dates et tri', () => {
		const query: Record<string, string> = {
			'form[username]': ' Tes* ',
			posts_greater: '10',
			registered_after: '2026-01-31',
			order_by: 'num_posts',
			direction: 'DESC',
			user_group: '4',
		};
		const result = readUserSearch((name) => query[name] ?? '');
		expect(result.kind).toBe('ok');
		if (result.kind !== 'ok') return;
		expect(result.criteria).toMatchObject({
			patterns: { username: 'Tes%' },
			postsGreater: 10,
			postsLess: null,
			group: 4,
			orderBy: 'num_posts',
			descending: true,
		});
		expect(result.criteria.dates.registered_after).toBe(new Date(2026, 0, 31).getTime() / 1000);
		expect(result.queryString).toContain('form%5Busername%5D=Tes*');
	});

	it('refuse les valeurs non numériques et les dates invalides, ignore un tri inconnu', () => {
		expect(readUserSearch((name) => (name === 'posts_less' ? '1a' : ''))).toEqual({ kind: 'nonNumeric' });
		expect(readUserSearch((name) => (name === 'last_visit_before' ? '31-02-2026' : ''))).toEqual({ kind: 'invalidDate' });
		const result = readUserSearch((name) => (name === 'order_by' ? 'password' : ''));
		expect(result.kind === 'ok' && result.criteria.orderBy).toBe('username');
	});

	it('formats de date de strtotime() proposés', () => {
		expect(parseAdminDate('28-10-2026 14:05')).toBe(new Date(2026, 9, 28, 14, 5).getTime() / 1000);
		expect(parseAdminDate('2026-10-28 14:05:09')).toBe(new Date(2026, 9, 28, 14, 5, 9).getTime() / 1000);
		expect(parseAdminDate('hier')).toBeNull();
	});
});

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

async function start(): Promise<{ server: FastifyInstance; fake: FakeData }> {
	const fake: FakeData = {
		users: [
			{ viewer: guest, passwordHash: '' },
			{ viewer: mod, passwordHash: 'h5' },
			{ viewer: tessy, passwordHash: 'h3' },
		],
		topics: [],
		posts: new Map(),
		ipStats: new Map([[3, [{ ip: '192.0.2.5', lastUsed: NOW - 60, timesFound: 4 }]]]),
		ipPosters: new Map([
			[
				'192.0.2.5',
				[
					{
						posterId: 3,
						poster: 'Tessy',
						user: {
							id: 3,
							username: 'Tessy',
							email: 't@example.test',
							title: '',
							numPosts: 1200,
							adminNote: 'à surveiller',
							groupId: 4,
							groupUserTitle: '',
						},
					},
					{ posterId: 1, poster: 'Visiteur', user: null },
				],
			],
		]),
		adminUserRows: [
			{ id: 7, username: 'Nouveau', email: 'n@example.test', title: '', numPosts: 0, adminNote: '', groupId: 0, groupUserTitle: '' },
		],
	};
	app = await buildApp(fakeDeps(fake));
	return { server: app, fake };
}

const get = (server: FastifyInstance, userId: number, url: string) => server.inject({ url, headers: { cookie: cookie(userId) } });

describe('admin_users.php', () => {
	it('réservé aux administrateurs et modérateurs', async () => {
		const { server } = await start();
		expect((await get(server, 3, '/admin_users.php')).statusCode).toBe(403);
		const page = await get(server, 5, '/admin_users.php');
		expect(page.body).toContain('name="form[admin_note]"');
		expect(page.body).toContain('<option value="0">Utilisateurs non vérifiés</option>');
	});

	it("statistiques d'IP d'un membre et membres d'une IP", async () => {
		const { server } = await start();
		const stats = await get(server, 5, '/admin_users.php?ip_stats=3');
		expect(stats.body).toContain('href="moderate.php?get_host=192.0.2.5"');
		expect(stats.body).toContain('href="admin_users.php?show_users=192.0.2.5"');
		const posters = await get(server, 5, '/admin_users.php?show_users=192.0.2.5');
		expect(posters.body).toContain('Messages&#160;: 1 200');
		expect(posters.body).toContain('à surveiller');
		expect(posters.body).toContain('Visiteur</strong> — Invité');
		expect((await get(server, 5, '/admin_users.php?show_users=pas-une-ip')).statusCode).toBe(400);
	});

	it('résultats de recherche : compte non vérifié signalé', async () => {
		const { server, fake } = await start();
		const res = await get(server, 5, '/admin_users.php?find_user=&form%5Busername%5D=Nou*');
		expect(res.body).toContain('Non vérifié');
		expect(fake.userSearches?.[0]?.patterns).toEqual({ username: 'Nou%' });
		expect((await get(server, 5, '/admin_users.php?find_user=&posts_less=x')).statusCode).toBe(400);
	});
});
