/**
 * Liste des membres : validation des critères, droits, rendu.
 */

import { describe, expect, it } from 'vitest';
import { buildApp, type ForumApp } from '../src/app.ts';
import { GroupId, type MemberSummary } from '../src/domain/models.ts';
import { fakeDeps, group, guest, NOW } from './fixtures.ts';
import { inject } from './inject.ts';

const member = (id: number, username: string, overrides: Partial<MemberSummary> = {}): MemberSummary => ({
	id,
	username,
	title: '',
	numPosts: id * 10,
	registered: NOW - id * 86_400,
	groupId: GroupId.Member,
	groupUserTitle: '',
	...overrides,
});

const members = [
	member(2, 'admin', { groupId: GroupId.Admin, groupUserTitle: 'Administrateur' }),
	member(3, 'Tessy', { title: 'Pilote <ligne>' }),
	member(5, 'MaxDUO'),
	...Array.from({ length: 55 }, (_, i) => member(100 + i, `pilote${String(i).padStart(2, '0')}`)),
];

let app: ForumApp | undefined;

const deps = (overrides = {}) =>
	fakeDeps({
		users: [{ viewer: guest }],
		topics: [],
		posts: new Map(),
		members,
		bannedUsernames: ['maxduo'],
		...overrides,
	});

describe('GET /userlist.php', () => {
	it('liste 50 membres par page avec titre, bannis et pagination conservant les critères', async () => {
		app = await buildApp(deps());
		const res = await inject(app, '/userlist.php');

		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('<title>Liste des membres (Page 1) / Forum de test</title>');
		expect(res.body).toContain('Pilote &lt;ligne&gt;');
		expect(res.body).toContain('<td data-label="Titre de l&#39;utilisateur">En vacances</td>');
		expect(res.body.match(/<tr>/g)?.length).toBe(1 + 50);
		expect(res.body).toContain('href="/membres?username=&amp;show_group=-1&amp;sort_by=username&amp;sort_dir=ASC&amp;p=2"');
	});

	it('filtre par pseudo avec joker et par groupe, et ignore les tris inconnus', async () => {
		app = await buildApp(deps());
		const res = await inject(app, '/userlist.php?username=pilote0*&show_group=4&sort_by=password&sort_dir=DESC');

		expect(res.body.match(/<tr>/g)?.length).toBe(1 + 10);
		expect(res.body).toContain('<option value="username" selected>');
		expect(res.body).toContain('<option value="DESC" selected>');
		expect(res.body).toContain('value="pilote0*"');
		expect(res.body.indexOf('pilote09')).toBeLessThan(res.body.indexOf('pilote00'));
	});

	it('sans g_search_users, le champ pseudo disparaît et le filtre est ignoré', async () => {
		const noSearch = { ...guest, group: group({ id: GroupId.Guest, canSearchUsers: false }) };
		app = await buildApp(deps({ users: [{ viewer: noSearch }] }));
		const res = await inject(app, '/userlist.php?username=Tessy');

		expect(res.body).not.toContain('name="username"');
		expect(res.body).toContain('admin');
	});

	it('refuse aux groupes qui ne peuvent pas voir les membres, aucun résultat sinon', async () => {
		const blind = { ...guest, group: group({ id: GroupId.Guest, canViewUsers: false }) };
		app = await buildApp(deps({ users: [{ viewer: blind }] }));
		expect((await inject(app, '/userlist.php')).statusCode).toBe(403);

		app = await buildApp(deps());
		expect((await inject(app, '/userlist.php?username=personne')).body).toContain('aucun résultat');
	});
});
