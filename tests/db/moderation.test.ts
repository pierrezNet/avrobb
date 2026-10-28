/**
 * Modération et administration sur une vraie base (ModerationRepository, signalements, statistiques) :
 * suppression et scission de messages, déplacement, fusion, suppression, fermeture et épinglage de sujets, balises de PV, avec les
 * compteurs des sujets et des forums. Transactions annulées.
 *
 * Jeu de données : sujet 10 (forum 2) avec les messages 100 (ouverture), 101 (MaxDUO) et 102
 * (admin) ; sujet 12 (forum 1) : lien de redirection vers le 10 ; sujet 11 dans le forum 3.
 */

import type { Kysely } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/db/database.ts';
import type { Database } from '../../src/db/schema.ts';
import type { ModeratedTopic } from '../../src/domain/models.ts';
import { ModerationRepository } from '../../src/repositories/ModerationRepository.ts';
import { testDbConfig } from './testDatabase.ts';

const db = createDatabase(testDbConfig());
afterAll(async () => db.destroy());

class Rollback extends Error {}

async function inRollback(body: (trx: Kysely<Database>) => Promise<void>): Promise<void> {
	await db
		.transaction()
		.execute(async (trx) => {
			await body(trx);
			throw new Rollback();
		})
		.catch((error: unknown) => {
			if (!(error instanceof Rollback)) throw error;
		});
}

const topic10: ModeratedTopic = {
	id: 10,
	subject: 'Postez un « vintage »',
	numReplies: 2,
	firstPostId: 100,
	forum: { id: 2, name: 'Captures' },
};

const topicRow = (trx: Kysely<Database>, id: number) =>
	trx
		.selectFrom('topics')
		.select(['forum_id', 'num_replies', 'last_post_id', 'moved_to', 'closed', 'sticky'])
		.where('id', '=', id)
		.executeTakeFirst();
const forumRow = (trx: Kysely<Database>, id: number) =>
	trx.selectFrom('forums').select(['num_topics', 'num_posts', 'last_post_id']).where('id', '=', id).executeTakeFirstOrThrow();

describe('ModerationRepository', () => {
	it('lit un sujet du forum et les forums de destination', async () => {
		const store = new ModerationRepository(db);
		expect(await store.findTopic(10, 2, 4)).toEqual({ ...topic10, forum: { id: 2, name: "Captures d'écran & Vidéos" } });
		expect(await store.findTopic(10, 1, 4)).toBeNull();
		// Forum 3 illisible pour les invités.
		expect(await store.findTopic(11, 3, 3)).toBeNull();
		expect((await store.listTargetForums(4)).map((forum) => forum.forumId)).toEqual([2, 1, 3]);
		expect(await store.findPostIp(101)).toBe('192.0.2.5');
	});

	it('supprime des réponses, jamais le premier message, et refuse celles d’un administrateur', async () => {
		await inRollback(async (trx) => {
			const store = new ModerationRepository(trx);
			expect(await store.deletePosts(topic10, [100, 101], true)).toBe(false);
			expect(await store.deletePosts(topic10, [102], false)).toBe(false);
			expect(await store.deletePosts(topic10, [101, 102], true)).toBe(true);
			expect(await topicRow(trx, 10)).toMatchObject({ num_replies: 0, last_post_id: 100 });
			expect(await forumRow(trx, 2)).toMatchObject({ num_topics: 1, num_posts: 1, last_post_id: 100 });
			const matches = await trx.selectFrom('search_matches').select('post_id').where('post_id', '=', 101).execute();
			expect(matches).toEqual([]);
		});
	});

	it('scinde des réponses dans un nouveau sujet, abonnements compris', async () => {
		await inRollback(async (trx) => {
			const store = new ModerationRepository(trx);
			expect(await store.splitPosts(topic10, [101], 4, 'Hors sujet', 4)).toBeNull();
			const newId = await store.splitPosts(topic10, [101, 102], 1, 'Scindé', 4);
			expect(newId).not.toBeNull();
			expect(await topicRow(trx, newId ?? 0)).toMatchObject({ forum_id: 1, num_replies: 1, last_post_id: 102 });
			expect(await topicRow(trx, 10)).toMatchObject({ num_replies: 0, last_post_id: 100 });
			const subscribed = await trx
				.selectFrom('topic_subscriptions')
				.select('user_id')
				.where('topic_id', '=', newId ?? 0)
				.execute();
			expect(subscribed).toEqual([{ user_id: 3 }]);
			expect(await forumRow(trx, 1)).toMatchObject({ num_topics: 3, last_post_id: 102 });
		});
	});

	it('déplace un sujet avec un lien de redirection, et supprime le lien devenu inutile', async () => {
		await inRollback(async (trx) => {
			const store = new ModerationRepository(trx);
			expect(await store.moveTopics(2, [10], 2, true, 4)).toBe(false);
			// Le forum 1 contient déjà un lien vers le sujet 10 : il disparaît, un autre est créé dans le forum 2.
			expect(await store.moveTopics(2, [10], 1, true, 4)).toBe(true);
			expect(await topicRow(trx, 10)).toMatchObject({ forum_id: 1 });
			expect(await topicRow(trx, 12)).toBeUndefined();
			const redirect = await trx.selectFrom('topics').select(['forum_id']).where('moved_to', '=', 10).execute();
			expect(redirect).toEqual([{ forum_id: 2 }]);
			expect(await forumRow(trx, 2)).toMatchObject({ num_topics: 1, num_posts: 1, last_post_id: null });
		});
	});

	it('fusionne dans le sujet le plus ancien et recalcule ses compteurs', async () => {
		await inRollback(async (trx) => {
			const created = await trx
				.insertInto('topics')
				.values({ poster: 'Tessy', subject: 'Doublon', posted: 1782800300, last_post: 1782800300, sticky: 0, forum_id: 2 })
				.executeTakeFirstOrThrow();
			const duplicate = Number(created.insertId);
			await trx
				.insertInto('posts')
				.values({
					poster: 'Tessy',
					poster_id: 3,
					poster_ip: '',
					poster_email: null,
					message: 'Encore',
					hide_smilies: 0,
					posted: 1782800300,
					topic_id: duplicate,
				})
				.execute();
			const store = new ModerationRepository(trx);
			expect(await store.mergeTopics(2, [duplicate], false)).toBeNull();
			expect(await store.mergeTopics(2, [10, duplicate], true)).toBe(10);
			expect(await topicRow(trx, 10)).toMatchObject({ num_replies: 3 });
			expect(await topicRow(trx, duplicate)).toMatchObject({ moved_to: 10 });
		});
	});

	it('supprime des sujets, sauf ceux où un administrateur a écrit pour un modérateur', async () => {
		await inRollback(async (trx) => {
			const store = new ModerationRepository(trx);
			expect(await store.deleteTopics(2, [10], false)).toBe('adminPosts');
			expect(await store.deleteTopics(1, [10], true)).toBe('invalid');
			expect(await store.deleteTopics(2, [10], true)).toBe('deleted');
			expect(await topicRow(trx, 10)).toBeUndefined();
			expect(await topicRow(trx, 12)).toBeUndefined();
			expect(await forumRow(trx, 2)).toMatchObject({ num_topics: 0, num_posts: 0 });
		});
	});

	it('ferme, épingle et pose les balises de PV', async () => {
		await inRollback(async (trx) => {
			const store = new ModerationRepository(trx);
			await store.setClosed(2, [10, 11], true);
			expect(await topicRow(trx, 10)).toMatchObject({ closed: 1 });
			expect(await topicRow(trx, 11)).toMatchObject({ closed: 0 });
			expect(await store.setSticky(2, 10, true)).toBe(true);
			expect(await topicRow(trx, 10)).toMatchObject({ sticky: 1 });

			expect(await store.setTopicLabel(2, 10, 1, false)).toBe(true);
			expect(await store.setTopicLabel(2, 10, 99, true)).toBe(false);
			// Sujet 13 (forum 1) sans ligne balises_modo : elle est créée.
			expect(await store.setTopicLabel(1, 13, 3, true)).toBe(true);
			const rows = await trx.selectFrom('balises_modo').selectAll().where('npost', 'in', ['10', '13']).orderBy('npost').execute();
			expect(rows).toEqual([
				{ npost: '10', bal1: 0, bal2: 1, bal3: 0 },
				{ npost: '13', bal1: 0, bal2: 0, bal3: 1 },
			]);
		});
	});
});

describe('ReportRepository (traitement)', () => {
	it('liste les signalements et en marque un comme traité', async () => {
		const { ReportRepository } = await import('../../src/repositories/ReportRepository.ts');
		await inRollback(async (trx) => {
			const reports = new ReportRepository(trx);
			const pending = await reports.listReports(false);
			expect(pending.map((r) => [r.message, r.reporter?.username, r.postId, r.topic?.subject])).toEqual([
				['Doublon', 'Tessy', 102, 'Postez un « vintage »'],
			]);
			const zapped = await reports.listReports(true);
			expect(zapped[0]?.zapped).toEqual({ at: 1782800400, by: { id: 2, username: 'admin' } });

			await reports.zap(pending[0]?.id ?? 0, 5, 1782900000);
			expect(await reports.listReports(false)).toEqual([]);
			expect((await reports.listReports(true)).map((r) => r.zapped?.by?.username)).toEqual(['MaxDUO', 'admin']);
			expect(await reports.hasPending()).toBe(false);
		});
	});
});

describe('AdminStatsRepository', () => {
	it('compte les visiteurs actifs et mesure les tables du forum', async () => {
		const { AdminStatsRepository } = await import('../../src/repositories/AdminStatsRepository.ts');
		const stats = new AdminStatsRepository(db, 'fo_');
		expect(await stats.countActiveOnline()).toBeGreaterThanOrEqual(0);
		const info = await stats.databaseInfo();
		expect(info.version).toMatch(/^\d+\.\d+/);
		expect(info.bytes).toBeGreaterThan(0);
	});
});

describe('ConfigRepository (admin_options.php)', () => {
	it('met à jour des clés, NULL compris', async () => {
		const { ConfigRepository } = await import('../../src/repositories/ConfigRepository.ts');
		await inRollback(async (trx) => {
			const store = new ConfigRepository(trx);
			await store.updateValues(
				new Map<string, string | null>([
					['o_board_title', 'Nouveau titre'],
					['o_smtp_host', 'smtp.example.test'],
					['o_time_format', null],
				]),
			);
			const values = await store.loadValues();
			expect(values.get('o_board_title')).toBe('Nouveau titre');
			expect(values.get('o_smtp_host')).toBe('smtp.example.test');
			const row = await trx.selectFrom('config').select('conf_value').where('conf_name', '=', 'o_time_format').executeTakeFirst();
			expect(row).toEqual({ conf_value: null });
		});
	});
});

describe('ForumAdminRepository (admin_categories.php, admin_forums.php)', () => {
	it('liste, ajoute, modifie et ordonne', async () => {
		const { ForumAdminRepository } = await import('../../src/repositories/ForumAdminRepository.ts');
		await inRollback(async (trx) => {
			const store = new ForumAdminRepository(trx);
			expect((await store.listCategories()).map((cat) => cat.id)).toEqual([2, 1]);
			expect((await store.listForums()).map((row) => row.forumId)).toEqual([2, 1, 3, 4]);
			await store.addForum(1, 'Nouveau forum');
			await store.addCategory('Vide');
			await store.updateForumPositions([{ id: 1, position: 9 }]);
			expect((await store.listForums()).map((row) => row.forumName).at(-1)).toBe('Technique');
			await store.updateForum(1, { name: 'Tech', description: null, redirectUrl: null, sortBy: 2, categoryId: 2 });
			expect(await store.findForum(1)).toMatchObject({ name: 'Tech', description: '', sortBy: 2, categoryId: 2 });
			await store.updateCategories([{ id: 1, name: 'Simus', position: 0 }]);
			expect((await store.listCategories()).map((cat) => cat.name).slice(0, 2)).toEqual(['Simus', 'Vide']);
		});
	});

	it('permissions des groupes : lecture, ligne propre, retour aux réglages du groupe', async () => {
		const { ForumAdminRepository } = await import('../../src/repositories/ForumAdminRepository.ts');
		await inRollback(async (trx) => {
			const store = new ForumAdminRepository(trx);
			const rows = await store.listGroupPermissions(2);
			expect(rows.map((row) => row.groupId)).toEqual([2, 3, 4]);
			expect(rows.find((row) => row.groupId === 4)?.forum).toEqual({ readForum: true, postReplies: false, postTopics: true });
			await store.setGroupPermission(2, 3, { readForum: false, postReplies: false, postTopics: false });
			await store.setGroupPermission(2, 4, { readForum: true, postReplies: true, postTopics: false });
			const perms = await trx.selectFrom('forum_perms').selectAll().where('forum_id', '=', 2).orderBy('group_id').execute();
			expect(perms).toEqual([
				{ group_id: 3, forum_id: 2, read_forum: 0, post_replies: 0, post_topics: 0 },
				{ group_id: 4, forum_id: 2, read_forum: 1, post_replies: 1, post_topics: 0 },
			]);
			await store.setGroupPermission(2, 4, null);
			await store.revertPermissions(3);
			expect(await trx.selectFrom('forum_perms').select(['group_id', 'forum_id']).execute()).toEqual([{ group_id: 3, forum_id: 2 }]);
		});
	});

	it('supprime un forum avec ses sujets, messages, index et redirections orphelines', async () => {
		const { ForumAdminRepository } = await import('../../src/repositories/ForumAdminRepository.ts');
		await inRollback(async (trx) => {
			await new ForumAdminRepository(trx).deleteForum(2);
			expect(await trx.selectFrom('forums').select('id').where('id', '=', 2).execute()).toEqual([]);
			expect(await trx.selectFrom('posts').select('id').where('id', 'in', [100, 101, 102]).execute()).toEqual([]);
			expect(await trx.selectFrom('search_matches').select('post_id').where('post_id', 'in', [100, 101, 102]).execute()).toEqual([]);
			// Sujet 12 (forum 1) : lien vers le sujet 10 supprimé.
			expect(await topicRow(trx, 12)).toBeUndefined();
			expect(await trx.selectFrom('forum_perms').select('group_id').where('forum_id', '=', 2).execute()).toEqual([]);
		});
	});

	it('supprime une catégorie et ses forums', async () => {
		const { ForumAdminRepository } = await import('../../src/repositories/ForumAdminRepository.ts');
		await inRollback(async (trx) => {
			await new ForumAdminRepository(trx).deleteCategory(1);
			expect((await trx.selectFrom('forums').select('id').execute()).map((row) => row.id)).toEqual([2]);
			expect(await trx.selectFrom('categories').select('id').execute()).toEqual([{ id: 2 }]);
			expect(await topicRow(trx, 11)).toBeUndefined();
		});
	});
});

describe('GroupAdminRepository (admin_groups.php)', () => {
	it('ajoute un groupe avec les permissions de sa base, le modifie et le supprime', async () => {
		const { GroupAdminRepository } = await import('../../src/repositories/GroupAdminRepository.ts');
		await inRollback(async (trx) => {
			const store = new GroupAdminRepository(trx);
			const groups = await store.listGroups();
			expect(groups.map((g) => g.title)).toEqual(['Administrateurs', 'Modérateurs', 'Invités', 'Membres']);
			const members = groups.find((g) => g.id === 4);
			if (members === undefined) throw new Error('groupe 4 absent');
			const settings = { title: 'Pilotes', userTitle: null, values: { ...members.values, g_post_flood: 30 } };
			expect(await store.titleExists('Membres', null)).toBe(true);
			expect(await store.titleExists('Membres', 4)).toBe(false);

			const id = await store.addGroup(settings, 4);
			expect(await trx.selectFrom('forum_perms').select(['forum_id', 'post_replies']).where('group_id', '=', id).execute()).toEqual([
				{ forum_id: 2, post_replies: 0 },
			]);
			const created = await trx
				.selectFrom('groups')
				.select(['g_post_flood', 'g_pm', 'g_rep_enable'])
				.where('g_id', '=', id)
				.executeTakeFirst();
			expect(created).toEqual({ g_post_flood: 30, g_pm: 1, g_rep_enable: 1 });

			await store.updateGroup(id, { ...settings, title: 'Instructeurs', userTitle: 'Instructeur' });
			await trx.updateTable('groups').set({ g_promote_next_group: id }).where('g_id', '=', 4).execute();
			await trx.updateTable('users').set({ group_id: id }).where('id', '=', 3).execute();
			expect(await store.countMembers(id)).toBe(1);

			await store.deleteGroup(id, 4);
			expect(await trx.selectFrom('users').select('group_id').where('id', '=', 3).executeTakeFirst()).toEqual({ group_id: 4 });
			expect(await trx.selectFrom('forum_perms').select('forum_id').where('group_id', '=', id).execute()).toEqual([]);
			expect(await trx.selectFrom('groups').select('g_promote_next_group').where('g_id', '=', 4).executeTakeFirst()).toEqual({
				g_promote_next_group: 0,
			});
		});
	});
});

describe('UserAdminRepository (admin_users.php)', () => {
	it('IP d’un membre, membres d’une IP et recherche multicritère', async () => {
		const { UserAdminRepository } = await import('../../src/repositories/UserAdminRepository.ts');
		const store = new UserAdminRepository(db);
		const stats = await store.listIpStats(5, 0, 50);
		expect(stats.map((s) => s.ip)).toContain('192.0.2.5');
		expect(await store.countIpStats(5)).toBe(stats.length);
		const posters = await store.listIpPosters('192.0.2.5', 0, 50);
		expect(posters.map((p) => [p.poster, p.user?.username])).toContainEqual(['MaxDUO', 'MaxDUO']);
		expect(await store.countIpPosters('203.0.113.99')).toBe(0);

		const base = {
			patterns: {},
			postsGreater: null,
			postsLess: null,
			dates: {},
			group: -1,
			orderBy: 'username' as const,
			descending: false,
		};
		const all = await store.searchUsers(base, 0, 50);
		expect(all.map((u) => u.id)).not.toContain(1);
		expect(await store.countUsers(base)).toBe(all.length);
		const found = await store.searchUsers({ ...base, patterns: { username: 'tes%' }, group: 4 }, 0, 50);
		expect(found.map((u) => u.username)).toEqual(['Tessy']);
		const sorted = await store.searchUsers({ ...base, orderBy: 'num_posts', descending: true }, 0, 1);
		expect(sorted).toHaveLength(1);
	});
});

describe('UserAdminRepository (actions groupées)', () => {
	it('change de groupe un modérateur et le retire des listes de modérateurs', async () => {
		const { UserAdminRepository } = await import('../../src/repositories/UserAdminRepository.ts');
		await inRollback(async (trx) => {
			const store = new UserAdminRepository(trx);
			expect(await store.countPrivileged([2, 3, 5])).toEqual({ admins: 1, moderators: 1 });
			expect((await store.listMoveTargets()).map((g) => g.id).sort()).toEqual([2, 4]);
			await store.moveUsers([5], 4, false);
			expect(await forumRow(trx, 2)).toBeDefined();
			const forum = await trx.selectFrom('forums').select('moderators').where('id', '=', 2).executeTakeFirstOrThrow();
			expect(forum.moderators).toBeNull();
			expect(await trx.selectFrom('users').select('group_id').where('id', '=', 5).executeTakeFirst()).toEqual({ group_id: 4 });
		});
	});

	it('supprime un membre et ses messages, ou les attribue à l’invité', async () => {
		const { UserAdminRepository } = await import('../../src/repositories/UserAdminRepository.ts');
		await inRollback(async (trx) => {
			await new UserAdminRepository(trx).deleteUsers([5], true);
			expect(await trx.selectFrom('posts').select('id').where('id', '=', 101).execute()).toEqual([]);
			expect(await topicRow(trx, 10)).toMatchObject({ num_replies: 1 });
			expect(await trx.selectFrom('users').select('id').where('id', '=', 5).execute()).toEqual([]);
		});
		await inRollback(async (trx) => {
			await new UserAdminRepository(trx).deleteUsers([5], false);
			expect(await trx.selectFrom('posts').select('poster_id').where('id', '=', 101).executeTakeFirst()).toEqual({ poster_id: 1 });
		});
	});

	it('bannit avec l’adresse du dernier message', async () => {
		const { UserAdminRepository } = await import('../../src/repositories/UserAdminRepository.ts');
		await inRollback(async (trx) => {
			await new UserAdminRepository(trx).banUsers([5], { message: 'Spam', expire: null, withIp: true, creatorId: 2 });
			const bans = await trx
				.selectFrom('bans')
				.select(['username', 'ip', 'email', 'message', 'ban_creator'])
				.where('username', '=', 'MaxDUO')
				.execute();
			expect(bans).toEqual([{ username: 'MaxDUO', ip: '192.0.2.5', email: 'max@example.test', message: 'Spam', ban_creator: 2 }]);
		});
	});
});
