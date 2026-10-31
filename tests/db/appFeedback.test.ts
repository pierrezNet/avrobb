/**
 * Migrations des retours d'applications rejouées sur le jeu de données : Phraséo (0005 à 0007) et
 * Donne Ton Point (0008). Compte système, forum privé « à trier » et réglages, puis création d'un
 * sujet dans ce forum.
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
			expect(config.appFeedback.phraseo).not.toBeNull();
			const { forumId, userId } = config.appFeedback.phraseo!;

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
			const { forumId, userId } = toBoardConfig(await new ConfigRepository(trx).loadValues()).appFeedback.phraseo!;
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
			expect(config.appFeedback.phraseo?.targetForumId).toBe(4);
		});
	});

	it('migration 0007 : compte système sans messagerie privée ni renommée', async () => {
		await inRollback(async (trx) => {
			await runScript(await migration());
			const { userId } = toBoardConfig(await new ConfigRepository(trx).loadValues()).appFeedback.phraseo!;
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

describe('migration 0008 : retours Donne Ton Point', () => {
	it('crée le compte système, le forum privé juste après le n° 3 et les réglages qui les désignent', async () => {
		await inRollback(async (trx) => {
			const forumOrder = () =>
				trx
					.selectFrom('forums')
					.select(['id', 'forum_name', 'disp_position'])
					.where('cat_id', '=', 1)
					.orderBy('disp_position')
					.orderBy('id')
					.execute();
			await runScript(await migration('0008_donnetonpoint_feedback.sql'));
			const config = toBoardConfig(await new ConfigRepository(trx).loadValues());
			expect(config.appFeedback.donneTonPoint).not.toBeNull();
			const { forumId, userId, targetForumId } = config.appFeedback.donneTonPoint!;
			// Forum public « Donne ton point » (n° 3 en production) comme destination des retours acceptés
			expect(targetForumId).toBe(3);
			// Phraséo n'est pas touché
			expect(config.appFeedback.phraseo).toBeNull();

			const user = await trx
				.selectFrom('users')
				.select(['username', 'provider', 'group_id', 'use_pm', 'reputation_enable'])
				.where('id', '=', userId)
				.executeTakeFirstOrThrow();
			// Sans fournisseur SSO (personne ne peut s'y connecter), sans messagerie privée ni renommée
			expect(user).toEqual({ username: 'Retours Donne Ton Point', provider: null, group_id: 4, use_pm: 0, reputation_enable: 0 });

			// Dans la catégorie du forum n° 3, juste après lui ; les forums suivants décalés
			expect((await forumOrder()).map((forum) => forum.id)).toEqual([1, 3, forumId, 4]);
			const forum = await trx.selectFrom('forums').select(['forum_name', 'cat_id']).where('id', '=', forumId).executeTakeFirstOrThrow();
			expect(forum).toEqual({ forum_name: 'Retours Donne Ton Point (à trier)', cat_id: 1 });

			const posting = new PostingRepository(trx);
			for (const groupId of [2, 3, 4]) expect(await posting.findTarget({ forumId }, { id: 2, groupId })).toBeNull();
			expect(await posting.findTarget({ forumId }, { id: 2, groupId: 1 })).not.toBeNull();
		});
	});

	it('cohabite avec Phraséo : deux comptes, deux forums, réglages distincts', async () => {
		await inRollback(async (trx) => {
			for (const file of [
				'0005_phraseo_feedback.sql',
				'0006_phraseo_feedback_target.sql',
				'0007_phraseo_feedback_user.sql',
				'0008_donnetonpoint_feedback.sql',
			])
				await runScript(await migration(file));
			const { phraseo, donneTonPoint } = toBoardConfig(await new ConfigRepository(trx).loadValues()).appFeedback;
			expect(phraseo).not.toBeNull();
			expect(donneTonPoint).not.toBeNull();
			expect(donneTonPoint!.forumId).not.toBe(phraseo!.forumId);
			expect(donneTonPoint!.userId).not.toBe(phraseo!.userId);
			expect(phraseo!.targetForumId).toBe(4);
			expect(donneTonPoint!.targetForumId).toBe(3);
		});
	});

	it('un retour devient un sujet du forum privé de Donne Ton Point', async () => {
		await inRollback(async (trx) => {
			await runScript(await migration('0008_donnetonpoint_feedback.sql'));
			const { forumId, userId } = toBoardConfig(await new ConfigRepository(trx).loadValues()).appFeedback.donneTonPoint!;
			const { topicId } = await new PostingRepository(trx).createTopic({
				author: { kind: 'member', id: userId, username: 'Retours Donne Ton Point', promoteTo: null },
				ip: '',
				message: 'Le compteur ne bouge plus.',
				hideSmilies: true,
				now: 1_782_900_000,
				words: { post: ['compteur', 'bouge'], subject: ['point'] },
				forumId,
				subject: '[Donne Ton Point] Bug : Le compteur ne bouge plus.',
				sticky: false,
				subscribe: false,
			});
			const topic = await trx.selectFrom('topics').select(['forum_id', 'poster']).where('id', '=', topicId).executeTakeFirstOrThrow();
			expect(topic).toEqual({ forum_id: forumId, poster: 'Retours Donne Ton Point' });
		});
	});
});
