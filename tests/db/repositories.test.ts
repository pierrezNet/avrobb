/**
 * Repositories et pages sur une vraie base MariaDB (jeu de données : tests/db/seed.sql).
 * Vérifie ce que les doublures ne peuvent pas : SQL généré, préfixe des tables, jointures,
 * permissions par forum, conversions de types de mysql2.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { NodeServerInfo } from '../../src/adapters/serverInfo.ts';
import { buildApp } from '../../src/app.ts';
import { createDatabase } from '../../src/db/database.ts';
import { GroupId } from '../../src/domain/models.ts';
import { fr, frDateWords } from '../../src/lang/fr/index.ts';
import { AdminStatsRepository } from '../../src/repositories/AdminStatsRepository.ts';
import { BanRepository } from '../../src/repositories/BanRepository.ts';
import { CensorRepository } from '../../src/repositories/CensorRepository.ts';
import { ConfigLoader } from '../../src/repositories/ConfigLoader.ts';
import { ConfigRepository } from '../../src/repositories/ConfigRepository.ts';
import { ContactRepository } from '../../src/repositories/ContactRepository.ts';
import { DraftRepository } from '../../src/repositories/DraftRepository.ts';
import { FeedRepository } from '../../src/repositories/FeedRepository.ts';
import { ForumAdminRepository } from '../../src/repositories/ForumAdminRepository.ts';
import { ForumRepository } from '../../src/repositories/ForumRepository.ts';
import { GalleryRepository } from '../../src/repositories/GalleryRepository.ts';
import { GroupAdminRepository } from '../../src/repositories/GroupAdminRepository.ts';
import { LabelAdminRepository } from '../../src/repositories/LabelAdminRepository.ts';
import { MaintenanceRepository } from '../../src/repositories/MaintenanceRepository.ts';
import { MemberSuggestRepository } from '../../src/repositories/MemberSuggestRepository.ts';
import { ModerationRepository } from '../../src/repositories/ModerationRepository.ts';
import { OnlineRepository } from '../../src/repositories/OnlineRepository.ts';
import { PostEditRepository } from '../../src/repositories/PostEditRepository.ts';
import { PostingRepository } from '../../src/repositories/PostingRepository.ts';
import { PostRepository } from '../../src/repositories/PostRepository.ts';
import { PremiumRepository } from '../../src/repositories/PremiumRepository.ts';
import { PrivateContactRepository } from '../../src/repositories/PrivateContactRepository.ts';
import { PrivateMessageRepository } from '../../src/repositories/PrivateMessageRepository.ts';
import { ProfileRepository } from '../../src/repositories/ProfileRepository.ts';
import { RegistrationRepository } from '../../src/repositories/RegistrationRepository.ts';
import { ReportRepository } from '../../src/repositories/ReportRepository.ts';
import { ReputationRepository } from '../../src/repositories/ReputationRepository.ts';
import { SearchRepository } from '../../src/repositories/SearchRepository.ts';
import { StatsRepository } from '../../src/repositories/StatsRepository.ts';
import { SubjectPrefixRepository } from '../../src/repositories/SubjectPrefixRepository.ts';
import { SubscriptionRepository } from '../../src/repositories/SubscriptionRepository.ts';
import { ToolbarRepository } from '../../src/repositories/ToolbarRepository.ts';
import { TopicLabelRepository } from '../../src/repositories/TopicLabelRepository.ts';
import { TopicRepository } from '../../src/repositories/TopicRepository.ts';
import { UserAdminRepository } from '../../src/repositories/UserAdminRepository.ts';
import { UserRepository } from '../../src/repositories/UserRepository.ts';
import { UsersInfoLoader } from '../../src/repositories/UsersInfoLoader.ts';
import { forumHmac } from '../../src/services/legacySession.ts';
import { testDbConfig } from './testDatabase.ts';

const db = createDatabase(testDbConfig());
afterAll(async () => db.destroy());

const NOW = 1_782_900_000;
const PASSWORD_HASH = 'b9b7c1e5e7fb7a6e2b0c1a9ce4a5c9d2d6e0b6a1';

describe('UserRepository', () => {
	const users = new UserRepository(db);

	it('charge un membre avec les droits de son groupe', async () => {
		const record = await users.findViewer(3);
		expect(record?.passwordHash).toBe(PASSWORD_HASH);
		expect(record?.viewer).toMatchObject({
			id: 3,
			username: 'Tessy',
			isGuest: false,
			postsPerPage: 1,
			lastVisit: 1_782_895_000,
			style: 'GreenDark',
			usesPrivateMessages: true,
			privateMessageCount: 5,
			group: { id: GroupId.Member, canSearch: true, canUsePrivateMessages: true, privateMessageLimit: 20, isModerator: false },
		});
	});

	it("reconnaît l'invité et renvoie null pour un identifiant inconnu", async () => {
		expect((await users.findViewer(1))?.viewer).toMatchObject({ isGuest: true, postsPerPage: null, group: { id: GroupId.Guest } });
		expect(await users.findViewer(999)).toBeNull();
	});
});

describe('liste des membres', () => {
	const members = new UserRepository(db);
	const all = { username: null, groupId: null };

	it('exclut l’invité, trie et filtre par pseudo (joker *) ou groupe', async () => {
		expect(await members.countMembers(all)).toBe(3);
		expect((await members.listMembers(all, 'username', 'asc', 0, 50)).map((m) => m.username)).toEqual(['admin', 'MaxDUO', 'Tessy']);
		expect((await members.listMembers(all, 'registered', 'desc', 0, 2)).map((m) => m.id)).toEqual([5, 3]);
		expect((await members.listMembers({ username: 'm*', groupId: null }, 'username', 'asc', 0, 50)).map((m) => m.username)).toEqual([
			'MaxDUO',
		]);
		expect(await members.countMembers({ username: null, groupId: GroupId.Member })).toBe(1);
		expect((await members.listMembers(all, 'num_posts', 'desc', 0, 1))[0]).toMatchObject({
			username: 'Tessy',
			title: 'Pilote de ligne',
			numPosts: 2,
		});
	});

	it('lit le profil public avec groupe, biographie et messagerie', async () => {
		expect(await members.findProfile(3)).toMatchObject({
			username: 'Tessy',
			title: 'Pilote de ligne',
			biography: 'Pilote de ligne depuis 2003 :)',
			icq: '',
			groupId: GroupId.Member,
			groupIsModerator: false,
			acceptsPrivateMessages: true,
		});
		expect((await members.findProfile(5))?.groupIsModerator).toBe(true);
		expect(await members.findProfile(999)).toBeNull();
	});

	it('retrouve les comptes par e-mail et enregistre un mot de passe en attente', async () => {
		expect(await members.findByEmail('tessy@example.test')).toEqual([{ id: 3, username: 'Tessy', lastEmailSent: null }]);
		await members.setPendingPassword(5, 'hash', 'cle12345', NOW);
		const row = await db
			.selectFrom('users')
			.select(['activate_string', 'activate_key', 'last_email_sent'])
			.where('id', '=', 5)
			.executeTakeFirstOrThrow();
		expect(row).toEqual({ activate_string: 'hash', activate_key: 'cle12345', last_email_sent: NOW });
	});

	it('propose tous les groupes sauf les invités', async () => {
		expect((await members.listGroups()).map((g) => g.id)).toEqual([1, 2, 4]);
	});
});

describe('TopicRepository', () => {
	const topics = new TopicRepository(db);

	it('applique forum_perms et ignore les sujets déplacés', async () => {
		const topic = await topics.findReadable(10, GroupId.Member);
		expect(topic).toMatchObject({ id: 10, numReplies: 2, firstPostId: 100, forumReplyPermission: false });
		expect(topic?.forum.moderators.get('MaxDUO')).toBe(5);

		expect(await topics.findReadable(11, GroupId.Guest)).toBeNull();
		expect((await topics.findReadable(11, GroupId.Member))?.forumReplyPermission).toBeNull();
		expect((await topics.findReadable(10, GroupId.Member, 3))?.isSubscribed).toBe(true);
		expect((await topics.findReadable(10, GroupId.Member, 5))?.isSubscribed).toBe(false);
		expect(await topics.findReadable(12, GroupId.Member)).toBeNull();
	});

	it('premier message après une date, compteur de vues', async () => {
		expect(await topics.findFirstPostAfter(10, 1_782_800_050)).toBe(101);
		expect(await topics.findFirstPostAfter(10, 1_782_800_200)).toBeNull();
		await topics.incrementViews(11);
		expect((await db.selectFrom('topics').select('num_views').where('id', '=', 11).executeTakeFirstOrThrow()).num_views).toBe(2);
	});

	it('situe un message dans son sujet', async () => {
		expect(await topics.locatePost(102)).toEqual({ topicId: 10, position: 3 });
		expect(await topics.locatePost(999)).toBeNull();
		expect(await topics.findLastPostId(10)).toBe(102);
		expect(await topics.findLastPostId(999)).toBeNull();
	});
});

describe('PostRepository', () => {
	it('pagine les messages avec auteur et présence en ligne (les inactifs sont hors ligne)', async () => {
		const posts = await new PostRepository(db).listPage(10, 0, 2);
		expect(posts.map((p) => p.id)).toEqual([100, 101]);
		expect(posts[0]).toMatchObject({ username: 'Tessy', author: { title: 'Pilote de ligne', location: 'Hyères', isOnline: true } });
		expect(posts[1]).toMatchObject({
			edited: 1_782_800_150,
			editedBy: 'MaxDUO',
			author: { groupUserTitle: 'Modérateur', isOnline: false },
		});
		expect((await new PostRepository(db).listPage(10, 2, 2)).map((p) => p.id)).toEqual([102]);
	});
});

describe('ForumRepository', () => {
	const forums = new ForumRepository(db);

	it("liste les forums lisibles dans l'ordre des catégories, redirections signalées", async () => {
		expect(await forums.listReadable(GroupId.Guest)).toEqual([
			{ id: 2, name: 'Ateliers & Médias', forums: [{ id: 2, name: "Captures d'écran & Vidéos", isRedirect: false }] },
			{
				id: 1,
				name: 'Simulateurs',
				forums: [
					{ id: 1, name: 'Technique', isRedirect: false },
					{ id: 4, name: 'Site officiel', isRedirect: true },
				],
			},
		]);
		expect((await forums.listReadable(GroupId.Member))[1]?.forums.map((f) => f.id)).toEqual([1, 3, 4]);
	});
});

describe('index : forums, sujets récents, statistiques', () => {
	it('liste les forums lisibles avec compteurs, description et dernier message', async () => {
		const categories = await new ForumRepository(db).listIndex(GroupId.Guest);
		expect(categories.map((c) => c.forums.map((f) => f.id))).toEqual([[2], [1, 4]]);
		expect(categories[0]?.forums[0]).toMatchObject({
			descriptionHtml: '<em>Vos plus beaux vols</em>',
			numTopics: 1,
			numPosts: 3,
			lastPost: { postedAt: 1_782_800_200, postId: 102, poster: 'admin' },
		});
		expect(categories[1]?.forums[1]).toMatchObject({ redirectUrl: 'https://example.test', lastPost: null });
	});

	it('liste les sujets mis à jour depuis une date, hors déplacés et forums interdits', async () => {
		const topics = new TopicRepository(db);
		expect((await topics.listUpdatedSince(GroupId.Member, 1_782_700_000)).map((t) => t.topicId).sort()).toEqual([10, 11]);
		expect((await topics.listUpdatedSince(GroupId.Guest, 1_782_700_000)).map((t) => t.topicId)).toEqual([10]);
		expect(await topics.listUpdatedSince(GroupId.Member, 1_782_800_200)).toEqual([]);
	});

	it('calcule totaux, membres, dernier inscrit et présents', async () => {
		const stats = new StatsRepository(db);
		expect(await stats.countTopicsAndPosts()).toEqual({ topics: 2, posts: 4 });
		expect(await stats.loadUsersInfo()).toEqual({ totalUsers: 3, newestUser: { id: 5, username: 'MaxDUO' } });
		expect(await stats.listOnline()).toEqual([
			{ userId: 1, ident: '192.0.2.9' },
			{ userId: 3, ident: 'Tessy' },
		]);
	});
});

describe('viewforum : forum et sujets', () => {
	it('lit le forum avec permissions et abonnement', async () => {
		const forums = new ForumRepository(db);
		expect(await forums.findReadable(2, GroupId.Member, 3)).toMatchObject({
			id: 2,
			numTopics: 1,
			sortBy: 'lastPost',
			topicPermission: true,
			isSubscribed: true,
		});
		expect(await forums.findReadable(2, GroupId.Guest, null)).toMatchObject({ topicPermission: null, isSubscribed: false });
		expect(await forums.findReadable(3, GroupId.Guest, null)).toBeNull();
		expect((await forums.findReadable(4, GroupId.Guest, null))?.redirectUrl).toBe('https://example.test');
	});

	it('liste les sujets du forum, épinglés d’abord, avec le point', async () => {
		const topics = new TopicRepository(db);
		const rows = await topics.listForumPage(1, 'lastPost', 0, 10, 3);
		expect(rows.map((t) => [t.id, t.sticky, t.movedTo, t.hasPosted])).toEqual([
			[13, true, null, false],
			[12, false, 10, false],
		]);
		expect((await topics.listForumPage(2, 'subject', 0, 10, 3))[0]).toMatchObject({
			id: 10,
			numViews: 42,
			hasPosted: true,
			lastPost: { postId: 102 },
		});
		expect((await topics.listForumPage(2, 'subject', 0, 10, null))[0]?.hasPosted).toBe(false);
	});

	it('discussions récentes et anciennes : les épinglées restent récentes', async () => {
		const topics = new TopicRepository(db);
		// Forum 1 : 13 épinglée (1782700000), 12 non épinglée (1782800200).
		const recent = { before: 1782800100, old: false };
		const old = { before: 1782800300, old: true };
		expect((await topics.listForumPage(1, 'lastPost', 0, 10, null, recent)).map((t) => t.id)).toEqual([13, 12]);
		expect(await topics.countForumTopics(1, { ...recent, before: 1782800300 })).toBe(1);
		expect((await topics.listForumPage(1, 'lastPost', 0, 10, null, old)).map((t) => t.id)).toEqual([12]);
		expect(await topics.countForumTopics(1, old)).toBe(1);
	});
});

describe('FeedRepository', () => {
	const feeds = new FeedRepository(db);
	it('flux d’une discussion et des discussions récentes, permissions et exclusions appliquées', async () => {
		expect(await feeds.findTopic(11, GroupId.Guest)).toBeNull();
		expect(await feeds.findTopic(10, GroupId.Guest)).toEqual({ subject: 'Postez un « vintage »', firstPostId: 100 });
		expect((await feeds.listTopicPosts(10, 2)).map((p) => p.id)).toEqual([102, 101]);
		expect(
			(await feeds.listRecentTopics({ groupId: GroupId.Member, forumIds: [], excludedForumIds: [], orderPosted: false, limit: 15 })).map(
				(t) => t.topicId,
			),
		).toEqual([10, 11]);
		expect(
			(await feeds.listRecentTopics({ groupId: GroupId.Member, forumIds: [], excludedForumIds: [2], orderPosted: true, limit: 15 }))[0],
		).toMatchObject({
			topicId: 11,
			id: 110,
			publicEmail: null,
		});
		expect(await feeds.findForumName(3, GroupId.Guest)).toBeNull();
	});
});

describe('GalleryRepository', () => {
	it('liste les images, plus récentes d’abord, en écartant une extension inattendue', async () => {
		const gallery = new GalleryRepository(db);
		expect(await gallery.countImages()).toBe(3);
		expect((await gallery.listImages(0, 10)).map((i) => [i.id, i.username, i.extension])).toEqual([
			[2, 'MaxDUO', '.gif'],
			[1, 'Tessy', '.jpg'],
		]);
	});
});

describe('SearchRepository', () => {
	const search = new SearchRepository(db);

	it('cherche un mot dans l’index, selon sujet ou message et les permissions', async () => {
		const ids = async (pattern: string, searchIn: 0 | 1 | -1, group: number) =>
			(await search.matchWord(pattern, searchIn, group, null, 0, 'posts')).map((hit) => hit.postId).sort();
		expect(await ids('vintage', 0, GroupId.Member)).toEqual([100, 101]);
		expect(await ids('vintage', 1, GroupId.Member)).toEqual([101]);
		expect(await ids('vintage', -1, GroupId.Member)).toEqual([100]);
		expect(await ids('avion', 0, GroupId.Member)).toEqual([101, 110]);
		expect(await ids('avion', 0, GroupId.Guest)).toEqual([101]);
		expect(await ids('av%', 0, GroupId.Member)).toEqual([101, 110]);
		expect((await search.matchWord('avion', 0, GroupId.Member, [3], 0, 'posts')).map((hit) => hit.postId)).toEqual([110]);
		expect(await search.matchWord('avion', 0, GroupId.Member, [], 0, 'posts')).toEqual([]);
	});

	it('trouve les messages d’un auteur, triés', async () => {
		const hits = await search.matchAuthor('max%', GroupId.Member, null, 0, 'posts', 'DESC');
		expect(hits.map((hit) => hit.postId)).toEqual([101]);
		expect((await search.matchAuthor('admin', GroupId.Member, null, 0, 'posts', 'ASC')).map((hit) => hit.postId)).toEqual([110, 102]);
	});

	it('recherches rapides', async () => {
		expect(await search.quickSearch({ action: 'show_unanswered', groupId: GroupId.Member })).toEqual([11, 13]);
		expect(await search.quickSearch({ action: 'show_recent', groupId: GroupId.Guest, since: 1_782_700_000, forumId: null })).toEqual([10]);
		expect(await search.quickSearch({ action: 'show_replies', groupId: GroupId.Member, userId: 3 })).toEqual([10]);
		expect(await search.quickSearch({ action: 'show_user_topics', groupId: GroupId.Member, userId: 2 })).toEqual([11]);
		expect(await search.quickSearch({ action: 'show_user_posts', groupId: GroupId.Member, userId: 2 })).toEqual([102, 110]);
		expect(await search.quickSearch({ action: 'show_subscriptions', groupId: GroupId.Member, userId: 3 })).toEqual([10]);
	});

	it('charge les résultats et relit search_cache pour son propriétaire', async () => {
		expect((await search.listTopics([10, 11], 2, 'ASC')).map((t) => [t.id, t.forumName])).toEqual([
			[10, "Captures d'écran & Vidéos"],
			[11, 'Équipe'],
		]);
		expect((await search.listPosts([101], 0, 'DESC'))[0]).toMatchObject({
			poster: 'MaxDUO',
			subject: 'Postez un « vintage »',
			firstPostId: 100,
			numReplies: 2,
		});
		expect(await search.findCachedSearch(77, 'Tessy')).toBe('a:1:{s:3:"foo";i:1;}');
		expect(await search.findCachedSearch(77, 'admin')).toBeNull();
		expect(await search.findUsername(6)).toBeNull();
	});
});

describe('OnlineRepository et bannissements (écritures)', () => {
	const online = new OnlineRepository(db);
	const bans = new BanRepository(db);

	it('entrée, rafraîchissement et purge de la liste des présents', async () => {
		await online.enter(1, '198.51.100.7', NOW - 1000);
		await online.enter(2, 'admin', NOW - 5000);
		// REPLACE INTO : une seconde entrée remplace la première au lieu de la dupliquer.
		await online.enter(1, '198.51.100.7', NOW - 900);
		expect(await online.findGuestPresence('198.51.100.7')).toEqual({ logged: NOW - 900, idle: false, lastPost: null, lastSearch: null });

		const stale = await online.listStale(NOW - 300);
		expect(stale.map((e) => e.ident).sort()).toEqual(['198.51.100.7', 'Tessy', 'admin', '192.0.2.9', 'MaxDUO'].sort());

		await online.applyPurge({ removeGuests: ['198.51.100.7'], endVisits: [{ userId: 2, logged: NOW - 5000 }], markIdle: [] });
		expect(await online.findGuestPresence('198.51.100.7')).toBeNull();
		const user = await db.selectFrom('users').select('last_visit').where('id', '=', 2).executeTakeFirstOrThrow();
		expect(user.last_visit).toBe(NOW - 5000);
		expect(await db.selectFrom('online').select('user_id').where('user_id', '=', 2).execute()).toEqual([]);

		await online.refreshMember(3, NOW);
		expect((await new UserRepository(db).findViewer(3))?.presence).toEqual({ logged: NOW, idle: false });
	});

	it('supprime des bannissements échus', async () => {
		await db.insertInto('bans').values({ username: 'ancien', ip: null, email: null, message: null, expire: 1, ban_creator: 2 }).execute();
		const all = await bans.listBans();
		const expired = all.filter((ban) => ban.expire === 1).map((ban) => ban.id);
		await bans.deleteBans(expired);
		expect((await bans.listBans()).length).toBe(all.length - 1);
	});
});

describe('RegistrationRepository', () => {
	const registrations = new RegistrationRepository(db);

	it('pseudo ressemblant, adresses utilisées, anti-flood par IP, création du compte', async () => {
		expect(await registrations.findSimilarUsername('tessy', 'tessy')).toBe('Tessy');
		expect(await registrations.findSimilarUsername('Max.DUO', 'MaxDUO')).toBe('MaxDUO');
		expect(await registrations.findSimilarUsername('Nouveau', 'Nouveau')).toBeNull();
		expect(await registrations.listUsernamesByEmail('tessy@example.test')).toEqual(['Tessy']);

		const id = await registrations.createUser({
			username: 'Nouveau',
			groupId: 4,
			passwordHash: 'h',
			email: 'nouveau@example.test',
			emailSetting: 1,
			timezone: 1,
			dst: true,
			language: 'French',
			style: 'Air',
			registeredAt: NOW,
			ip: '203.0.113.9',
		});
		expect(id).toBeGreaterThan(5);
		expect(await registrations.hasRecentRegistration('203.0.113.9', NOW - 3600)).toBe(true);
		expect(await registrations.hasRecentRegistration('203.0.113.10', NOW - 3600)).toBe(false);
		expect((await new UserRepository(db).findViewer(id))?.viewer).toMatchObject({
			username: 'Nouveau',
			timezone: 1,
			dst: true,
			showSmilies: true,
		});
		await db.deleteFrom('users').where('id', '=', id).execute();
	});
});

describe('ReportRepository et PrivateMessageRepository', () => {
	it('détecte les signalements non traités', async () => {
		expect(await new ReportRepository(db).hasPending()).toBe(true);

		const rollback = new Error('rollback');
		await expect(
			db.transaction().execute(async (trx) => {
				await trx.deleteFrom('reports').where('zapped', 'is', null).execute();
				expect(await new ReportRepository(trx).hasPending()).toBe(false);
				throw rollback;
			}),
		).rejects.toBe(rollback);
	});

	it('compte les MP non lus et visibles du membre', async () => {
		const messages = new PrivateMessageRepository(db);
		expect(await messages.countUnread(3)).toBe(2);
		expect(await messages.countUnread(2)).toBe(1);
		expect(await messages.countUnread(5)).toBe(0);
	});
});

describe('balises, bannissements, censure', () => {
	it('lit les balises posées sur les sujets, par colonne bal<id>, dans l’ordre des positions', async () => {
		const labels = await new TopicLabelRepository(db).listForTopics([10, 11, 999]);
		expect([...labels.keys()]).toEqual([10]);
		expect(labels.get(10)?.map((l) => [l.name, l.style, l.bold])).toEqual([
			['En cours', 'hashes', false],
			['Réglé', 'brackets', true],
		]);
		expect((await new TopicLabelRepository(db).listForTopics([])).size).toBe(0);
	});

	it('liste les pseudos bannis en minuscules, expirés compris', async () => {
		expect(await new BanRepository(db).listBannedUsernames()).toEqual(new Set(['maxduo']));
	});

	it('liste les mots censurés', async () => {
		expect(await new CensorRepository(db).listWords()).toEqual([
			{ searchFor: 'zut', replaceWith: '***' },
			{ searchFor: 'flûte*', replaceWith: '[censuré]' },
		]);
	});
});

describe('ConfigLoader sur la table config', () => {
	it('lit et convertit les options, NULL compris', async () => {
		const loader = new ConfigLoader(new ConfigRepository(db), null, () => NOW);
		expect(await loader.load()).toMatchObject({
			boardTitle: 'Forum de test',
			defaultPostsPerPage: 2,
			feedType: 'none',
			privateMessagesEnabled: true,
		});
	});
});

describe('viewtopic de bout en bout', () => {
	const seed = 'graine-de-test';
	const cookie = (userId: number): string => {
		const expires = NOW + 3600;
		const value = `${userId}|${forumHmac(PASSWORD_HASH, `${seed}_password_hash`)}|${expires}|${forumHmac(`${userId}|${expires}`, `${seed}_cookie_hash`)}`;
		return `punbb_cookie=${value}`;
	};

	async function app() {
		return buildApp({
			config: new ConfigLoader(new ConfigRepository(db), null, () => NOW),
			users: new UserRepository(db),
			members: new UserRepository(db),
			credentials: new UserRepository(db),
			passwordResets: new UserRepository(db),
			registrations: new RegistrationRepository(db),
			mailTemplates: { load: async () => ({ subject: '', body: '' }) },
			mailer: { send: async () => undefined },
			profiles: new UserRepository(db),
			profileStore: new ProfileRepository(db),
			topics: new TopicRepository(db),
			topicWriter: new TopicRepository(db),
			posts: new PostRepository(db),
			posting: new PostingRepository(db),
			postEdits: new PostEditRepository(db),
			drafts: new DraftRepository(db),
			subscriptions: new SubscriptionRepository(db),
			reputation: new ReputationRepository(db),
			premium: new PremiumRepository(db),
			moderation: new ModerationRepository(db),
			hostResolver: { reverse: async (ip) => ip },
			searchWriter: new SearchRepository(db),
			contacts: new ContactRepository(db),
			reportWriter: new ReportRepository(db),
			reportStore: new ReportRepository(db),
			adminStats: new AdminStatsRepository(db, 'fo_'),
			configStore: new ConfigRepository(db),
			forumAdmin: new ForumAdminRepository(db),
			maintenance: new MaintenanceRepository(db),
			labelAdmin: new LabelAdminRepository(db),
			imageProcessor: { toWebp: async () => null, avatar: async () => null },
			subjectPrefixes: new SubjectPrefixRepository(db),
			memberSuggest: new MemberSuggestRepository(db),
			groupAdmin: new GroupAdminRepository(db),
			userAdmin: new UserAdminRepository(db),
			banStore: new BanRepository(db),
			configCache: { invalidate: async () => {} },
			serverInfo: new NodeServerInfo(),
			toolbar: new ToolbarRepository(db),
			forums: new ForumRepository(db),
			reports: new ReportRepository(db),
			privateMessages: new PrivateMessageRepository(db),
			privateMessageStore: new PrivateMessageRepository(db),
			privateContacts: new PrivateContactRepository(db),
			sendingLists: new PrivateContactRepository(db),
			bans: new BanRepository(db),
			censorship: new CensorRepository(db),
			topicLabels: new TopicLabelRepository(db),
			stats: new StatsRepository(db),
			search: new SearchRepository(db),
			feeds: new FeedRepository(db),
			gallery: new GalleryRepository(db),
			galleryFiles: { save: async (addedAt) => addedAt, delete: async () => undefined },
			stopwords: { load: async () => new Set<string>() },
			usersInfo: new UsersInfoLoader(new StatsRepository(db), null, () => NOW),
			avatars: { urlFor: async () => null },
			avatarStore: { save: async () => undefined, delete: async () => undefined },
			uploads: {
				list: async () => null,
				exists: async () => false,
				save: async () => undefined,
				remove: async () => false,
				listOwners: async () => [],
				urlFor: () => '',
			},
			page: { lang: fr, dateWords: frDateWords, clock: () => NOW },
			legacyCookie: { name: 'punbb_cookie', seed, path: '/', domain: '', secure: false },
			online: new OnlineRepository(db),
			phpCache: null,
			legacyBaseUrl: 'http://php.test',
		});
	}

	it('affiche le sujet au membre avec son thème, ses MP et la pagination de son profil', async () => {
		const server = await app();
		const res = await server.inject({ url: '/viewtopic.php?id=10&p=2', headers: { cookie: cookie(3) } });
		await server.close();

		expect(res.statusCode).toBe(200);
		expect(res.body).toContain(
			'<title>[Réglé] #En cours# Postez un « vintage » (Page 2) / Captures d&#39;écran &amp; Vidéos / Forum de test</title>',
		);
		expect(res.body).toContain('themes/GreenDark.css');
		expect(res.body).toContain('id="p101"');
		expect(res.body).not.toContain('id="p100"');
		expect(res.body).toContain('(2) <abbr title="Messages privés">MP</abbr>');
		expect(res.body).toContain('Boîtes de messages privés pleines à 25');
		// forum_perms : les membres ne peuvent pas répondre dans le forum 2.
		expect(res.body).not.toContain('post.php?tid=10"');
	});

	it('refuse aux invités un sujet de forum interdit, et montre au modérateur ses outils', async () => {
		const server = await app();
		const denied = await server.inject('/viewtopic.php?id=11');
		const mod = await server.inject({ url: '/viewtopic.php?id=10', headers: { cookie: cookie(5) } });
		await server.close();

		expect(denied.statusCode).toBe(404);
		expect(mod.body).toContain('moderate.php?fid=2&amp;close=10');
		expect(mod.body).toContain('admin_reports.php');
		expect(mod.body).toContain('themes/Air.css');
	});
});
