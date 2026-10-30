/**
 * Consultation d'un profil : sections affichées selon les droits, biographie, et aiguillage vers
 * la modification (tests/profile-edit.test.ts) ou vers le PHP pour la section Administration.
 */

import { describe, expect, it } from 'vitest';
import { buildApp, type ForumApp } from '../src/app.ts';
import { GroupId, type UserProfile } from '../src/domain/models.ts';
import { canEditProfile } from '../src/services/permissions.ts';
import { fakeDeps, group, guest, NOW, sessionCookie, viewer } from './fixtures.ts';
import { inject } from './inject.ts';

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
	return {
		id: 6,
		username: 'valdefsx',
		email: 'val@example.test',
		emailSetting: 1,
		title: '',
		realname: 'Valentin <V>',
		url: 'www.valdefsx.test',
		location: 'Lyon',
		jabber: '',
		icq: '12345',
		msn: '',
		aim: '',
		yahoo: '',
		signature: '[b]Bons vols[/b]',
		numPosts: 12,
		lastPost: NOW - 600,
		registered: NOW - 86_400 * 3,
		groupId: GroupId.Member,
		groupUserTitle: '',
		groupIsModerator: false,
		acceptsPrivateMessages: true,
		...overrides,
	};
}

const tessy = viewer();
const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true, canModEditUsers: true }) });
const admin = viewer({ id: 2, username: 'admin', group: group({ id: GroupId.Admin }) });

describe('canEditProfile (profile.php)', () => {
	const member = { id: 6, groupId: GroupId.Member, groupIsModerator: false };
	it('soi-même, un administrateur, ou un modérateur autorisé sur un simple membre', () => {
		expect(canEditProfile(tessy, member)).toBe(false);
		expect(canEditProfile(viewer({ id: 6 }), member)).toBe(true);
		expect(canEditProfile(admin, { ...member, groupId: GroupId.Admin })).toBe(true);
		expect(canEditProfile(mod, member)).toBe(true);
		expect(canEditProfile(mod, { ...member, groupIsModerator: true })).toBe(false);
		expect(canEditProfile(mod, { ...member, groupId: GroupId.Admin })).toBe(false);
		expect(canEditProfile(viewer({ ...mod, group: group({ isModerator: true, canModEditUsers: false }) }), member)).toBe(false);
		expect(canEditProfile(guest, { ...member, id: 1 })).toBe(false);
	});
});

const users = [{ viewer: guest }, { viewer: tessy }, { viewer: mod }];

let app: ForumApp | undefined;

const deps = (overrides = {}) =>
	fakeDeps({ users, topics: [], posts: new Map(), profiles: [profile(), profile({ id: 3, username: 'Tessy' })], ...overrides });

describe('GET /profile.php', () => {
	it('affiche le profil public, échappé, avec signature, biographie et recherches', async () => {
		app = await buildApp(deps());
		const res = await inject(app, { url: '/profile.php?id=6', headers: { cookie: sessionCookie(3) } });

		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('<title>Profil de valdefsx / Forum de test</title>');
		expect(res.body).toContain('Valentin &lt;V&gt;');
		expect(res.body).toContain('<a href="http://www.valdefsx.test" rel="nofollow ugc">www.valdefsx.test</a>');
		expect(res.body).toContain('href="misc.php?email=6"');
		expect(res.body).not.toContain('val@example.test');
		expect(res.body).toContain('<dd>12345</dd>');
		expect(res.body).toContain('<strong>Bons vols</strong>');
		expect(res.body).toContain('search.php?action=show_user_posts&amp;user_id=6');
		expect(res.body).not.toContain('show_subscriptions');
	});

	it('invité : ni e-mail ni MP', async () => {
		app = await buildApp(deps({ profiles: [profile({ emailSetting: 0 })], config: { privateMessagesEnabled: true } }));
		const res = await inject(app, '/profile.php?id=6');
		expect(res.body).not.toContain('mailto:');
		expect(res.body).not.toContain('pms_send.php');
	});

	it('modification servie par le forum ; plus de section Administration', async () => {
		app = await buildApp(deps());
		const own = await inject(app, { url: '/profile.php?id=3', headers: { cookie: sessionCookie(3) } });
		expect(own.statusCode).toBe(200);
		expect(own.body).toContain('Tessy - Principal');

		const asMod = await inject(app, { url: '/profile.php?id=6', headers: { cookie: sessionCookie(5) } });
		expect(asMod.body).toContain('valdefsx - Principal');
		// La section Administration de FluxBB n'existe plus : admin_users.php la remplace.
		const admin = await inject(app, { url: '/profile.php?section=admin&id=6', headers: { cookie: sessionCookie(5) } });
		expect(admin.statusCode).toBe(404);

		// Un lecteur qui ne peut pas modifier consulte, quelle que soit la section.
		expect((await inject(app, '/profile.php?section=personal&id=6')).body).toContain('Profil de valdefsx');
		expect((await inject(app, '/profile.php?action=inconnue&id=6')).statusCode).toBe(404);
	});

	it('404 pour un identifiant invalide ou inconnu, 403 sans g_view_users', async () => {
		app = await buildApp(deps());
		expect((await inject(app, '/profile.php?id=1')).statusCode).toBe(404);
		expect((await inject(app, '/profile.php?id=999')).statusCode).toBe(404);

		const blind = { ...guest, group: group({ id: GroupId.Guest, canViewUsers: false }) };
		app = await buildApp(deps({ users: [{ viewer: blind }] }));
		expect((await inject(app, '/profile.php?id=6')).statusCode).toBe(403);
	});
});
