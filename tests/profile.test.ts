/**
 * Consultation d'un profil : sections affichées selon les droits, biographie, et renvoi vers le PHP
 * pour tout ce qui relève de la modification.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { GroupId, type UserProfile } from '../src/domain/models.ts';
import { forumHmac } from '../src/services/legacySession.ts';
import { canEditProfile } from '../src/services/permissions.ts';
import { fakeDeps, group, guest, NOW, viewer } from './fixtures.ts';

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
		biography: 'Pilote depuis [i]FS98[/i] :)',
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

const SEED = 'graine-de-test';
const cookie = (userId: number, hash: string): string => {
	const expires = NOW + 3600;
	return `punbb_cookie=${userId}|${forumHmac(hash, `${SEED}_password_hash`)}|${expires}|${forumHmac(`${userId}|${expires}`, `${SEED}_cookie_hash`)}`;
};
const users = [
	{ viewer: guest, passwordHash: '' },
	{ viewer: tessy, passwordHash: 'hash-tessy' },
	{ viewer: mod, passwordHash: 'hash-mod' },
];

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

const deps = (overrides = {}) =>
	fakeDeps({ users, topics: [], posts: new Map(), profiles: [profile(), profile({ id: 3, username: 'Tessy' })], ...overrides });

describe('GET /profile.php', () => {
	it('affiche le profil public, échappé, avec signature, biographie et recherches', async () => {
		app = await buildApp(deps());
		const res = await app.inject({ url: '/profile.php?id=6', headers: { cookie: cookie(3, 'hash-tessy') } });

		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('<title>Profil de valdefsx / Forum de test</title>');
		expect(res.body).toContain('Valentin &lt;V&gt;');
		expect(res.body).toContain('<a href="http://www.valdefsx.test" rel="nofollow ugc">www.valdefsx.test</a>');
		expect(res.body).toContain('http://php.test/misc.php?email=6');
		expect(res.body).not.toContain('val@example.test');
		expect(res.body).toContain('<dd>12345</dd>');
		expect(res.body).toContain('<strong>Bons vols</strong>');
		expect(res.body).toContain('Pilote depuis <em>FS98</em> <span class="smiley"');
		expect(res.body).toContain('search.php?action=show_user_posts&amp;user_id=6');
		expect(res.body).not.toContain('show_subscriptions');
	});

	it('invité : ni e-mail ni MP ; biographie absente signalée', async () => {
		app = await buildApp(deps({ profiles: [profile({ biography: '', emailSetting: 0 })], config: { privateMessagesEnabled: true } }));
		const res = await app.inject('/profile.php?id=6');
		expect(res.body).not.toContain('mailto:');
		expect(res.body).not.toContain('pms_send.php');
		expect(res.body).toContain('Ce membre n&#39;a pas écrit sa biographie');
	});

	it('renvoie vers le PHP : son propre profil, un modérateur autorisé, une section, une action, un autre plugile', async () => {
		app = await buildApp(deps());
		const own = await app.inject({ url: '/profile.php?id=3', headers: { cookie: cookie(3, 'hash-tessy') } });
		expect(own.statusCode).toBe(302);
		expect(own.headers.location).toBe('http://php.test/profile.php?id=3');

		const asMod = await app.inject({ url: '/profile.php?id=6', headers: { cookie: cookie(5, 'hash-mod') } });
		expect(asMod.headers.location).toBe('http://php.test/profile.php?id=6');

		expect((await app.inject('/profile.php?section=personal&id=6')).headers.location).toBe(
			'http://php.test/profile.php?section=personal&id=6',
		);
		expect((await app.inject('/profile.php?action=change_pass&id=6&key=x')).headers.location).toBe(
			'http://php.test/profile.php?action=change_pass&id=6&key=x',
		);
		expect((await app.inject('/profile.php?plugin=UPP_Suivile.php&id=6')).statusCode).toBe(302);
		expect((await app.inject('/profile.php?plugin=UP_Ma_biographie.php&id=6')).statusCode).toBe(200);
	});

	it('404 pour un identifiant invalide ou inconnu, 403 sans g_view_users', async () => {
		app = await buildApp(deps());
		expect((await app.inject('/profile.php?id=1')).statusCode).toBe(404);
		expect((await app.inject('/profile.php?id=999')).statusCode).toBe(404);
		await app.close();

		const blind = { ...guest, group: group({ id: GroupId.Guest, canViewUsers: false }) };
		app = await buildApp(deps({ users: [{ viewer: blind, passwordHash: '' }] }));
		expect((await app.inject('/profile.php?id=6')).statusCode).toBe(403);
	});
});
