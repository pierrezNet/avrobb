/**
 * Écritures partagées par la rédaction, sur une vraie base : index de recherche
 * (update_search_index(), strip_search_index()) et compteurs de forum (update_forum()).
 * Chaque test s'exécute dans une transaction annulée à la fin, pour laisser le jeu de données intact.
 */

import type { Kysely } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/db/database.ts';
import type { Database } from '../../src/db/schema.ts';
import { ContactRepository } from '../../src/repositories/ContactRepository.ts';
import { DraftRepository } from '../../src/repositories/DraftRepository.ts';
import { updateForum } from '../../src/repositories/forumCounters.ts';
import { PostEditRepository } from '../../src/repositories/PostEditRepository.ts';
import { PostingRepository } from '../../src/repositories/PostingRepository.ts';
import { ReportRepository } from '../../src/repositories/ReportRepository.ts';
import { SubscriptionRepository } from '../../src/repositories/SubscriptionRepository.ts';
import { stripSearchIndex, updateSearchIndex } from '../../src/repositories/searchIndexSql.ts';
import { ToolbarRepository } from '../../src/repositories/ToolbarRepository.ts';
import { testDbConfig } from './testDatabase.ts';

const db = createDatabase(testDbConfig());
afterAll(async () => db.destroy());

class Rollback extends Error {}

/** Exécute `body` dans une transaction toujours annulée. */
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

async function indexOf(trx: Kysely<Database>, postId: number): Promise<string[]> {
	const rows = await trx
		.selectFrom('search_matches as m')
		.innerJoin('search_words as w', 'w.id', 'm.word_id')
		.select(['w.word', 'm.subject_match'])
		.where('m.post_id', '=', postId)
		.orderBy('w.word')
		.orderBy('m.subject_match')
		.execute();
	return rows.map((row) => `${row.word}${row.subject_match === 1 ? ' (sujet)' : ''}`);
}

const words = async (trx: Kysely<Database>): Promise<string[]> =>
	(await trx.selectFrom('search_words').select('word').orderBy('word').execute()).map((row) => row.word);

describe('index de recherche', () => {
	it('indexe un nouveau message en réutilisant les mots connus', async () => {
		await inRollback(async (trx) => {
			await updateSearchIndex(trx, 'post', 200, { post: ['avion', 'cockpit'], subject: ['avion'] });
			expect(await indexOf(trx, 200)).toEqual(['avion', 'avion (sujet)', 'cockpit']);
			expect(await words(trx)).toEqual(['avion', 'cockpit', 'interne', 'vintage']);
		});
	});

	it('ne réécrit que les différences à la modification', async () => {
		await inRollback(async (trx) => {
			await updateSearchIndex(trx, 'edit', 101, { post: ['avion', 'hélice'], subject: [] });
			expect(await indexOf(trx, 101)).toEqual(['avion', 'hélice']);
			// « vintage » reste connu : il sert encore au sujet du message 100.
			expect(await words(trx)).toContain('vintage');
		});
	});

	it('retire des messages et les mots qui ne servaient qu’à eux', async () => {
		await inRollback(async (trx) => {
			await stripSearchIndex(trx, [110]);
			expect(await indexOf(trx, 110)).toEqual([]);
			expect(await words(trx)).toEqual(['avion', 'vintage']);
		});
	});
});

describe('update_forum()', () => {
	it('recompte sujets et messages, dernier message hors sujets déplacés', async () => {
		await inRollback(async (trx) => {
			await updateForum(trx, 1);
			const forum = await trx
				.selectFrom('forums')
				.select(['num_topics', 'num_posts', 'last_post', 'last_post_id', 'last_poster'])
				.where('id', '=', 1)
				.executeTakeFirstOrThrow();
			// Sujets 12 (déplacé, 2 réponses) et 13 : le déplacé compte, mais n'est pas le dernier message.
			expect(forum).toEqual({ num_topics: 2, num_posts: 4, last_post: 1782700000, last_post_id: 0, last_poster: 'admin' });
		});
	});

	it('vide le dernier message d’un forum sans sujet', async () => {
		await inRollback(async (trx) => {
			await updateForum(trx, 4);
			const forum = await trx
				.selectFrom('forums')
				.select(['num_topics', 'num_posts', 'last_post'])
				.where('id', '=', 4)
				.executeTakeFirstOrThrow();
			expect(forum).toEqual({ num_topics: 0, num_posts: 0, last_post: null });
		});
	});
});

describe('PostingRepository', () => {
	const words = { post: ['réponse'], subject: [] };

	it('lit la cible : permissions du groupe, abonnement, forum de redirection', async () => {
		const posting = new PostingRepository(db);
		expect(await posting.findTarget({ topicId: 10 }, { id: 3, groupId: 4 })).toMatchObject({
			forum: { id: 2, isRedirect: false },
			replyPermission: false,
			topicPermission: true,
			topic: { id: 10, subject: 'Postez un « vintage »', closed: false, isSubscribed: true },
		});
		expect(await posting.findTarget({ topicId: 11 }, { id: 1, groupId: 3 })).toBeNull();
		expect(await posting.findTarget({ topicId: 12 }, { id: 3, groupId: 4 })).toBeNull();
		expect(await posting.findTarget({ forumId: 4 }, { id: 3, groupId: 4 })).toMatchObject({ forum: { isRedirect: true }, topic: null });
		expect(await posting.findQuote(101, 10)).toEqual({ poster: 'MaxDUO', message: 'Deuxième message' });
		expect(await posting.findQuote(110, 10)).toBeNull();
		expect((await posting.listReview(10, 2)).map((p) => p.message)).toEqual(['Troisième message', 'Deuxième message']);
	});

	it('enregistre une réponse avec tous les effets de bord de post.php', async () => {
		await inRollback(async (trx) => {
			const posting = new PostingRepository(trx);
			const postId = await posting.createReply({
				topicId: 10,
				forumId: 2,
				author: { kind: 'member', id: 3, username: 'Tessy', promoteTo: 2 },
				ip: '192.0.2.1',
				message: 'Une réponse',
				hideSmilies: true,
				now: 1782900000,
				words,
				subscription: 'remove',
			});
			const post = await trx.selectFrom('posts').selectAll().where('id', '=', postId).executeTakeFirstOrThrow();
			expect(post).toMatchObject({
				poster: 'Tessy',
				poster_id: 3,
				poster_ip: '192.0.2.1',
				hide_smilies: 1,
				topic_id: 10,
				poster_email: null,
			});
			expect(
				await trx
					.selectFrom('topics')
					.select(['num_replies', 'last_post', 'last_post_id', 'last_poster'])
					.where('id', '=', 10)
					.executeTakeFirst(),
			).toEqual({
				num_replies: 3,
				last_post: 1782900000,
				last_post_id: postId,
				last_poster: 'Tessy',
			});
			expect(await trx.selectFrom('forums').select(['num_posts', 'last_post_id']).where('id', '=', 2).executeTakeFirst()).toEqual({
				num_posts: 4,
				last_post_id: postId,
			});
			expect(
				await trx.selectFrom('users').select(['num_posts', 'last_post', 'group_id']).where('id', '=', 3).executeTakeFirst(),
			).toMatchObject({
				last_post: 1782900000,
				group_id: 2,
			});
			expect(await trx.selectFrom('topic_subscriptions').selectAll().where('user_id', '=', 3).execute()).toEqual([]);
			expect(await indexOf(trx, postId)).toEqual(['réponse']);
		});
	});

	it('crée une discussion d’invité', async () => {
		await inRollback(async (trx) => {
			const posting = new PostingRepository(trx);
			await trx.insertInto('online').values({ user_id: 1, ident: '198.51.100.20', logged: 1782899000, idle: 0 }).execute();
			const { topicId, postId } = await posting.createTopic({
				forumId: 1,
				subject: 'Premier vol',
				sticky: false,
				subscribe: false,
				author: { kind: 'guest', username: 'Pilote', email: 'pilote@example.test' },
				ip: '198.51.100.20',
				message: 'Bonjour',
				hideSmilies: false,
				now: 1782900000,
				words: { post: ['bonjour'], subject: ['premier'] },
			});
			expect(await trx.selectFrom('topics').selectAll().where('id', '=', topicId).executeTakeFirst()).toMatchObject({
				poster: 'Pilote',
				subject: 'Premier vol',
				first_post_id: postId,
				last_post_id: postId,
				num_replies: 0,
				forum_id: 1,
			});
			expect(await trx.selectFrom('posts').select(['poster_id', 'poster_email']).where('id', '=', postId).executeTakeFirst()).toEqual({
				poster_id: 1,
				poster_email: 'pilote@example.test',
			});
			expect(await trx.selectFrom('forums').select(['num_topics', 'last_post_id']).where('id', '=', 1).executeTakeFirst()).toEqual({
				num_topics: 3,
				last_post_id: postId,
			});
			expect(await trx.selectFrom('online').select('last_post').where('ident', '=', '198.51.100.20').executeTakeFirst()).toEqual({
				last_post: 1782900000,
			});
			expect(await indexOf(trx, postId)).toEqual(['bonjour', 'premier (sujet)']);
		});
	});

	it('abonnés à prévenir : venus depuis le message précédent, non bannis, sauf l’auteur', async () => {
		const posting = new PostingRepository(db);
		// Tessy (abonnée au sujet 10) est en ligne depuis 1782899000, après le message précédent.
		expect(await posting.listTopicSubscribers(10, 2, 2)).toEqual([{ email: 'tessy@example.test', notifyWithPost: false }]);
		expect(await posting.listTopicSubscribers(10, 2, 3)).toEqual([]);
		expect(await posting.listForumSubscribers(2, 5)).toEqual([{ email: 'tessy@example.test', notifyWithPost: false }]);
	});
});

describe('ToolbarRepository', () => {
	it('null sans boutons, sinon réglages et boutons dans l’ordre, images filtrées', async () => {
		expect(await new ToolbarRepository(db).load()).toBeNull();
		await inRollback(async (trx) => {
			await trx
				.insertInto('toolbar_conf')
				.values([
					{ conf_name: 'enable_form', conf_value: '1' },
					{ conf_name: 'enable_quick', conf_value: '0' },
					{ conf_name: 'img_pack', conf_value: '../x' },
				])
				.execute();
			await trx
				.insertInto('toolbar_tags')
				.values([
					{ name: 'italic', code: 'i', enable_form: 1, enable_quick: 0, image: 'bt_italic.png', func: '0', position: 2 },
					{ name: 'link', code: 'url', enable_form: 1, enable_quick: 1, image: '../evil.png', func: '2', position: 1 },
				])
				.execute();
			expect(await new ToolbarRepository(trx).load()).toEqual({
				enableForm: true,
				enableQuick: false,
				imagePack: 'smooth',
				tags: [
					{ name: 'link', code: 'url', func: 2, image: '', enableForm: true, enableQuick: true },
					{ name: 'italic', code: 'i', func: 0, image: 'bt_italic.png', enableForm: true, enableQuick: false },
				],
			});
		});
	});
});

describe('PostEditRepository', () => {
	const topicRow = (trx: Kysely<Database>, id: number) =>
		trx
			.selectFrom('topics')
			.select(['subject', 'sticky', 'num_replies', 'last_post_id', 'last_poster'])
			.where('id', '=', id)
			.executeTakeFirst();

	it('lit le message avec ses droits, auteur administrateur compris', async () => {
		const edits = new PostEditRepository(db);
		expect(await edits.findPost(102, 4)).toMatchObject({
			id: 102,
			poster: 'admin',
			posterId: 2,
			posterIsAdmin: true,
			topic: { id: 10, firstPostId: 100, closed: false },
			forum: { id: 2, moderators: new Map([['MaxDUO', 5]]) },
		});
		expect(await edits.findPost(101, 4)).toMatchObject({ posterIsAdmin: false });
		expect(await edits.findPost(110, 3)).toBeNull();
	});

	it('modifie le message, le sujet et ses liens de déplacement, et l’index', async () => {
		await inRollback(async (trx) => {
			await new PostEditRepository(trx).updatePost({
				postId: 100,
				topicId: 10,
				message: 'Message revu',
				hideSmilies: true,
				edited: { at: 1782900000, by: 'Tessy' },
				topic: { subject: 'Sujet revu', sticky: true },
				words: { post: ['message', 'revu'], subject: ['sujet', 'revu'] },
			});
			expect(
				await trx.selectFrom('posts').select(['message', 'hide_smilies', 'edited', 'edited_by']).where('id', '=', 100).executeTakeFirst(),
			).toEqual({
				message: 'Message revu',
				hide_smilies: 1,
				edited: 1782900000,
				edited_by: 'Tessy',
			});
			expect(await topicRow(trx, 10)).toMatchObject({ subject: 'Sujet revu', sticky: 1 });
			// Le lien laissé dans le forum 1 par le déplacement (sujet 12) suit.
			expect(await topicRow(trx, 12)).toMatchObject({ subject: 'Sujet revu' });
			expect(await indexOf(trx, 100)).toEqual(['message', 'revu', 'revu (sujet)', 'sujet (sujet)']);
		});
	});

	it('modification silencieuse : pas de mention', async () => {
		await inRollback(async (trx) => {
			await new PostEditRepository(trx).updatePost({
				postId: 101,
				topicId: 10,
				message: 'x',
				hideSmilies: false,
				edited: null,
				topic: null,
				words: { post: [], subject: [] },
			});
			expect(await trx.selectFrom('posts').select(['edited', 'edited_by']).where('id', '=', 101).executeTakeFirst()).toEqual({
				edited: 1782800150,
				edited_by: 'MaxDUO',
			});
		});
	});

	it('supprime le dernier message : le sujet et le forum reprennent l’avant-dernier', async () => {
		await inRollback(async (trx) => {
			const edits = new PostEditRepository(trx);
			const post = await edits.findPost(102, 4);
			if (post === null) throw new Error('message 102 absent');
			expect(await edits.deletePost(post)).toBe(101);
			expect(await topicRow(trx, 10)).toMatchObject({ num_replies: 1, last_post_id: 101, last_poster: 'MaxDUO' });
			expect(await trx.selectFrom('forums').select(['num_posts', 'last_post_id']).where('id', '=', 2).executeTakeFirst()).toEqual({
				num_posts: 2,
				last_post_id: 101,
			});
		});
	});

	it('supprime une discussion : messages, index, abonnements, liens de déplacement', async () => {
		await inRollback(async (trx) => {
			const edits = new PostEditRepository(trx);
			const post = await edits.findPost(100, 4);
			if (post === null) throw new Error('message 100 absent');
			await edits.deleteTopic(post);
			expect(await trx.selectFrom('topics').select('id').where('id', 'in', [10, 12]).execute()).toEqual([]);
			expect(await trx.selectFrom('posts').select('id').where('topic_id', '=', 10).execute()).toEqual([]);
			expect(await trx.selectFrom('topic_subscriptions').selectAll().where('topic_id', '=', 10).execute()).toEqual([]);
			// Fidèle à strip_search_index() : « vintage », compté deux fois (messages 100 et 101), reste orphelin.
			expect(await words(trx)).toEqual(['avion', 'interne', 'vintage']);
			expect(await trx.selectFrom('search_matches').select('post_id').where('post_id', 'in', [100, 101, 102]).execute()).toEqual([]);
			expect(
				await trx.selectFrom('forums').select(['num_topics', 'num_posts', 'last_post']).where('id', '=', 2).executeTakeFirst(),
			).toEqual({
				num_topics: 0,
				num_posts: 0,
				last_post: null,
			});
		});
	});
});

describe('DraftRepository', () => {
	it('crée, liste, modifie et supprime les brouillons de leur auteur', async () => {
		await inRollback(async (trx) => {
			const drafts = new DraftRepository(trx);
			const topicDraft = await drafts.create({
				poster: 'Tessy',
				posterId: 3,
				subject: 'Récit',
				message: 'à finir',
				posted: 1782900000,
				topicId: null,
				forumId: 2,
			});
			const replyDraft = await drafts.create({
				poster: 'Tessy',
				posterId: 3,
				subject: null,
				message: 'réponse',
				posted: 1782900100,
				topicId: 10,
				forumId: 2,
			});

			expect(await drafts.listByPoster(3)).toEqual([
				{
					id: replyDraft,
					posterId: 3,
					subject: 'Postez un « vintage »',
					message: 'réponse',
					posted: 1782900100,
					topicId: 10,
					forum: { id: 2, name: "Captures d'écran & Vidéos" },
				},
				{
					id: topicDraft,
					posterId: 3,
					subject: 'Récit',
					message: 'à finir',
					posted: 1782900000,
					topicId: null,
					forum: { id: 2, name: "Captures d'écran & Vidéos" },
				},
			]);

			await drafts.update(topicDraft, { subject: 'Récit complet', message: 'fini' });
			expect(await drafts.find(topicDraft)).toMatchObject({ subject: 'Récit complet', message: 'fini' });

			await drafts.delete(topicDraft, 5);
			expect(await drafts.find(topicDraft)).not.toBeNull();
			await drafts.delete(topicDraft, 3);
			expect(await drafts.find(topicDraft)).toBeNull();
		});
	});
});

describe('SubscriptionRepository', () => {
	it('lecture permise, abonnement et désabonnement aux sujets et forums', async () => {
		const read = new SubscriptionRepository(db);
		expect(await read.isReadable({ kind: 'topic', id: 10 }, 3)).toBe(true);
		expect(await read.isReadable({ kind: 'topic', id: 11 }, 3)).toBe(false);
		expect(await read.isReadable({ kind: 'topic', id: 12 }, 4)).toBe(false);
		expect(await read.isReadable({ kind: 'forum', id: 3 }, 3)).toBe(false);
		expect(await read.isSubscribed({ kind: 'topic', id: 10 }, 3)).toBe(true);
		await inRollback(async (trx) => {
			const subscriptions = new SubscriptionRepository(trx);
			await subscriptions.subscribe({ kind: 'forum', id: 1 }, 5);
			expect(await subscriptions.isSubscribed({ kind: 'forum', id: 1 }, 5)).toBe(true);
			await subscriptions.unsubscribe({ kind: 'topic', id: 10 }, 3);
			expect(await subscriptions.isSubscribed({ kind: 'topic', id: 10 }, 3)).toBe(false);
		});
	});
});

describe('ContactRepository et signalements', () => {
	it('destinataire, délais de l’expéditeur et dates d’envoi', async () => {
		const contacts = new ContactRepository(db);
		expect(await contacts.findRecipient(5)).toEqual({ username: 'MaxDUO', email: 'max@example.test', emailSetting: 1 });
		expect(await contacts.findRecipient(1)).toBeNull();
		await inRollback(async (trx) => {
			const writer = new ContactRepository(trx);
			await writer.markEmailSent(3, 1782900000);
			await writer.markReportSent(3, 1782900100);
			expect(await writer.findSenderLimits(3)).toEqual({
				lastEmailSent: 1782900000,
				emailFlood: 60,
				lastReportSent: 1782900100,
				reportFlood: 60,
			});
		});
	});

	it('cible lisible et création d’un signalement', async () => {
		const reports = new ReportRepository(db);
		expect(await reports.findTarget(101, 4)).toEqual({
			postId: 101,
			topicId: 10,
			subject: 'Postez un « vintage »',
			forumId: 2,
			forumName: "Captures d'écran & Vidéos",
		});
		expect(await reports.findTarget(110, 3)).toBeNull();
		await inRollback(async (trx) => {
			const writer = new ReportRepository(trx);
			const target = await writer.findTarget(101, 4);
			if (target === null) throw new Error('message 101 absent');
			await writer.create({ target, reportedBy: 3, created: 1782900000, message: 'Hors sujet' });
			expect(
				await trx
					.selectFrom('reports')
					.select(['post_id', 'topic_id', 'forum_id', 'reported_by', 'message', 'zapped'])
					.where('created', '=', 1782900000)
					.execute(),
			).toEqual([{ post_id: 101, topic_id: 10, forum_id: 2, reported_by: 3, message: 'Hors sujet', zapped: null }]);
		});
	});
});
