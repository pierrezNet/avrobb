/**
 * Migration 0005 (retours de l'application Phraséo) rejouée sur le jeu de données : compte système,
 * forum privé « à trier » et réglages, puis création d'un sujet dans ce forum.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ConfigRepository } from '../../src/repositories/ConfigRepository.ts';
import { PostingRepository } from '../../src/repositories/PostingRepository.ts';
import { toBoardConfig } from '../../src/services/boardConfig.ts';
import { closeTestDatabase, inRollback, runScript } from './testDb.ts';

afterAll(closeTestDatabase);

const migration = (file = '0005_phraseo_feedback.sql') => readFile(path.join(import.meta.dirname, '..', '..', 'migrations', file), 'utf8');

describe('migration 0005 : retours Phraséo', () => {
	it('crée le compte système, le forum privé et les réglages qui les désignent', async () => {
		await inRollback(async (trx) => {
			await runScript(await migration());
			const config = toBoardConfig(await new ConfigRepository(trx).loadValues());
			expect(config.phraseoFeedback).not.toBeNull();
			const { forumId, userId } = config.phraseoFeedback!;

			const user = await trx
				.selectFrom('users')
				.select(['username', 'provider', 'group_id'])
				.where('id', '=', userId)
				.executeTakeFirstOrThrow();
			// Sans fournisseur SSO : personne ne peut s'y connecter
			expect(user).toEqual({ username: 'Retours Phraséo', provider: null, group_id: 4 });

			const forum = await trx.selectFrom('forums').select(['forum_name', 'cat_id']).where('id', '=', forumId).executeTakeFirstOrThrow();
			expect(forum.forum_name).toBe('Retours Phraséo (à trier)');
			// Rangé dans la catégorie du forum n° 4 (celui de la phraséologie en production)
			expect(forum.cat_id).toBe(1);

			// Illisible pour modérateurs, invités et membres ; les administrateurs le lisent toujours
			const posting = new PostingRepository(trx);
			for (const groupId of [2, 3, 4]) expect(await posting.findTarget({ forumId }, { id: 2, groupId })).toBeNull();
			expect(await posting.findTarget({ forumId }, { id: 2, groupId: 1 })).not.toBeNull();
		});
	});

	it('un retour devient un sujet du forum privé, compteurs du forum à jour', async () => {
		await inRollback(async (trx) => {
			await runScript(await migration());
			const { forumId, userId } = toBoardConfig(await new ConfigRepository(trx).loadValues()).phraseoFeedback!;
			const { topicId } = await new PostingRepository(trx).createTopic({
				author: { kind: 'member', id: userId, username: 'Retours Phraséo', promoteTo: null },
				ip: '',
				message: 'La voix se répète.',
				hideSmilies: true,
				now: 1_782_900_000,
				words: { post: ['voix', 'répète'], subject: ['phraséo'] },
				forumId,
				subject: '[Phraséo] Bug technique : La voix se répète.',
				sticky: false,
				subscribe: false,
			});
			const topic = await trx.selectFrom('topics').select(['forum_id', 'poster']).where('id', '=', topicId).executeTakeFirstOrThrow();
			expect(topic).toEqual({ forum_id: forumId, poster: 'Retours Phraséo' });
			const counters = await trx
				.selectFrom('forums')
				.select(['num_topics', 'num_posts'])
				.where('id', '=', forumId)
				.executeTakeFirstOrThrow();
			expect(counters).toEqual({ num_topics: 1, num_posts: 1 });
		});
	});

	it('migration 0006 : forum public des retours acceptés, le n° 4 s’il existe', async () => {
		await inRollback(async (trx) => {
			await runScript(await migration());
			await runScript(await migration('0006_phraseo_feedback_target.sql'));
			const config = toBoardConfig(await new ConfigRepository(trx).loadValues());
			expect(config.phraseoFeedback?.targetForumId).toBe(4);
		});
	});

	it('migration 0007 : compte système sans messagerie privée ni renommée', async () => {
		await inRollback(async (trx) => {
			await runScript(await migration());
			const { userId } = toBoardConfig(await new ConfigRepository(trx).loadValues()).phraseoFeedback!;
			const settings = () => trx.selectFrom('users').select(['id', 'use_pm', 'reputation_enable']).orderBy('id').execute();
			const before = await settings();

			await runScript(await migration('0007_phraseo_feedback_user.sql'));
			// Seul le compte système change
			const expected = before.map((user) => (user.id === userId ? { ...user, use_pm: 0, reputation_enable: 0 } : user));
			expect(await settings()).toEqual(expected);
			expect(before.find((user) => user.id === userId)).toMatchObject({ use_pm: 1, reputation_enable: 1 });
		});
	});
});
