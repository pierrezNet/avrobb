/**
 * Écritures partagées par la rédaction, sur une vraie base : index de recherche
 * (update_search_index(), strip_search_index()) et compteurs de forum (update_forum()).
 * Chaque test s'exécute dans une transaction annulée à la fin, pour laisser le jeu de données intact.
 */

import type { Kysely } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/db/database.ts';
import type { Database } from '../../src/db/schema.ts';
import { updateForum } from '../../src/repositories/forumCounters.ts';
import { PostingRepository } from '../../src/repositories/PostingRepository.ts';
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
