/**
 * Utilisateurs dans l'administration (admin_users.php) : critères de recherche
 * (services/userSearch.ts) et pages de bout en bout avec les doublures.
 */

import { describe, expect, it } from 'vitest';
import { buildApp, type ForumApp } from '../src/app.ts';
import { GroupId } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { parseBanExpire, readUserIds } from '../src/services/userActions.ts';
import { parseAdminDate, readUserSearch } from '../src/services/userSearch.ts';
import { type FakeData, fakeDeps, group, guest, NOW, sessionCookie, viewer } from './fixtures.ts';
import { inject } from './inject.ts';

const SEED = 'graine-de-test';
const CSRF_SECRET = '9'.repeat(64);
const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true }) });
const banMod = viewer({ id: 6, username: 'Garde', group: group({ id: 6, isModerator: true, canModBanUsers: true }) });
const admin = viewer({ id: 2, username: 'admin', group: group({ id: GroupId.Admin }) });
const tessy = viewer();
const cookie = (userId: number): string => `${sessionCookie(userId)}; avrobb_csrf=${CSRF_SECRET}`;

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

let app: ForumApp | undefined;

async function start(): Promise<{ server: ForumApp; fake: FakeData }> {
	const fake: FakeData = {
		users: [{ viewer: guest }, { viewer: mod }, { viewer: tessy }, { viewer: banMod }, { viewer: admin }],
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

const get = (server: ForumApp, userId: number, url: string) => inject(server, { url, headers: { cookie: cookie(userId) } });

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
		expect(stats.body).toContain('href="/moderate.php?get_host=192.0.2.5"');
		expect(stats.body).toContain('href="/admin_users.php?show_users=192.0.2.5"');
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

describe('actions groupées', () => {
	it('lecture des comptes sélectionnés et de la date d’expiration', () => {
		expect(readUserIds({ 'users[7]': '1', 'users[1]': '1', users: '8,x,0' })).toEqual([7, 8]);
		const now = Date.UTC(2026, 9, 28) / 1000;
		expect(parseBanExpire('', 0, now)).toBeNull();
		expect(parseBanExpire('2026-11-01', 3600, now)).toBe(Date.UTC(2026, 10, 1) / 1000 - 3600);
		expect(parseBanExpire('2026-10-01', 0, now)).toBe('invalid');
		expect(parseBanExpire('01/11/2026', 0, now)).toBe('invalid');
	});

	const post = (server: ForumApp, userId: number, fields: Record<string, string>) =>
		inject(server, {
			method: 'POST',
			url: '/admin_users.php',
			headers: { cookie: cookie(userId), 'content-type': 'application/x-www-form-urlencoded' },
			payload: new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, userId), ...fields }).toString(),
		});

	it('cases et boutons selon les droits', async () => {
		const { server } = await start();
		const asMod = await get(server, 5, '/admin_users.php?find_user=');
		expect(asMod.body).not.toContain('name="users[7]"');
		const asBanMod = await get(server, 6, '/admin_users.php?find_user=');
		expect(asBanMod.body).toContain('name="users[7]"');
		expect(asBanMod.body).toContain('name="ban_users"');
		expect(asBanMod.body).not.toContain('name="delete_users"');
		expect((await get(server, 2, '/admin_users.php?find_user=')).body).toContain('name="move_users"');
	});

	it('changer de groupe et supprimer : administrateurs seulement, après confirmation', async () => {
		const { server, fake } = await start();
		expect((await post(server, 6, { move_users: '1', 'users[3]': '1' })).statusCode).toBe(403);
		const confirm = await post(server, 2, { move_users: '1', 'users[3]': '1' });
		expect(confirm.body).toContain('name="users" value="3"');
		expect(confirm.body).toContain('<option value="4">Membres</option>');
		expect(confirm.body).toContain('<option value="1">Administrateurs</option>');
		await post(server, 2, { move_users_comply: '1', users: '3', new_group: '4' });
		// Nommer un administrateur ; jamais changer son propre groupe ; groupe inconnu refusé.
		await post(server, 2, { move_users_comply: '1', users: '3', new_group: '1' });
		expect((await post(server, 2, { move_users: '1', 'users[2]': '1' })).body).toContain('Vous ne pouvez pas changer votre propre groupe');
		expect((await post(server, 2, { move_users_comply: '1', users: '2,3', new_group: '4' })).statusCode).toBe(400);
		expect((await post(server, 2, { move_users_comply: '1', users: '3', new_group: '3' })).statusCode).toBe(400);
		expect((await post(server, 2, { delete_users: '1', 'users[2]': '1' })).body).toContain('Les administrateurs ne peuvent être supprimés');
		const deleted = await post(server, 2, { delete_users_comply: '1', users: '3', delete_posts: '1' });
		expect(deleted.headers.location).toBe('/admin_users.php?done=deleted');
		expect(fake.userActionLog).toEqual(['move 3 -> 4', 'move 3 -> 1', 'delete 3 +posts']);
	});

	it('bannir : pas les modérateurs, date future', async () => {
		const { server, fake } = await start();
		expect((await post(server, 6, { ban_users: '1', 'users[5]': '1' })).body).toContain('Les modérateurs ne peuvent être bannis');
		expect((await post(server, 6, { ban_users_comply: '1', users: '3', ban_expire: '2000-01-01' })).statusCode).toBe(400);
		const done = await post(server, 6, { ban_users_comply: '1', users: '3', ban_message: ' Spam ', ban_expire: '', ban_the_ip: '1' });
		expect(done.headers.location).toBe('/admin_users.php?done=banned');
		expect(fake.userActionLog).toEqual(['ban 3 {"message":"Spam","expire":null,"withIp":true,"creatorId":6}']);
	});
});
