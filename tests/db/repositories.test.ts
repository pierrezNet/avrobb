/**
 * Repositories et pages sur une vraie base MariaDB (jeu de données : tests/db/seed.sql).
 * Vérifie ce que les doublures ne peuvent pas : SQL généré, préfixe des tables, jointures,
 * permissions par forum, conversions de types de mysql2.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.ts';
import { createDatabase } from '../../src/db/database.ts';
import { GroupId } from '../../src/domain/models.ts';
import { fr, frDateWords } from '../../src/lang/fr/index.ts';
import { BanRepository } from '../../src/repositories/BanRepository.ts';
import { CensorRepository } from '../../src/repositories/CensorRepository.ts';
import { ConfigLoader } from '../../src/repositories/ConfigLoader.ts';
import { ConfigRepository } from '../../src/repositories/ConfigRepository.ts';
import { ForumRepository } from '../../src/repositories/ForumRepository.ts';
import { PostRepository } from '../../src/repositories/PostRepository.ts';
import { PrivateMessageRepository } from '../../src/repositories/PrivateMessageRepository.ts';
import { ReportRepository } from '../../src/repositories/ReportRepository.ts';
import { TopicLabelRepository } from '../../src/repositories/TopicLabelRepository.ts';
import { TopicRepository } from '../../src/repositories/TopicRepository.ts';
import { UserRepository } from '../../src/repositories/UserRepository.ts';
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

describe('TopicRepository', () => {
	const topics = new TopicRepository(db);

	it('applique forum_perms et ignore les sujets déplacés', async () => {
		const topic = await topics.findReadable(10, GroupId.Member);
		expect(topic).toMatchObject({ id: 10, numReplies: 2, firstPostId: 100, forumReplyPermission: false });
		expect(topic?.forum.moderators.get('MaxDUO')).toBe(5);

		expect(await topics.findReadable(11, GroupId.Guest)).toBeNull();
		expect((await topics.findReadable(11, GroupId.Member))?.forumReplyPermission).toBeNull();
		expect(await topics.findReadable(12, GroupId.Member)).toBeNull();
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
			feedType: 'atom',
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
			topics: new TopicRepository(db),
			posts: new PostRepository(db),
			forums: new ForumRepository(db),
			reports: new ReportRepository(db),
			privateMessages: new PrivateMessageRepository(db),
			bans: new BanRepository(db),
			censorship: new CensorRepository(db),
			topicLabels: new TopicLabelRepository(db),
			avatars: { urlFor: async () => null },
			page: { lang: fr, dateWords: frDateWords, clock: () => NOW },
			legacyCookie: { name: 'punbb_cookie', seed },
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
