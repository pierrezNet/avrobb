/**
 * Renommée sur une vraie base (ReputationRepository) : cible d'un vote selon les droits de lecture,
 * vote et totaux de users, historique, suppression avec recalcul. Transactions annulées.
 */

import type { Kysely } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/db/database.ts';
import type { Database } from '../../src/db/schema.ts';
import { ReputationRepository } from '../../src/repositories/ReputationRepository.ts';
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

describe('ReputationRepository', () => {
	it('cible un message lisible par le groupe du votant', async () => {
		const store = new ReputationRepository(db);
		expect(await store.findTarget(101, 4)).toEqual({
			postId: 101,
			topicId: 10,
			authorId: 5,
			authorName: 'MaxDUO',
			authorReputationEnabled: true,
		});
		// Message 110 : forum 3, interdit en lecture aux invités.
		expect(await store.findTarget(110, 3)).toBeNull();
		expect(await store.findTarget(110, 4)).not.toBeNull();
	});

	it('vote, totaux, historique et suppression avec recalcul', async () => {
		await inRollback(async (trx) => {
			const store = new ReputationRepository(trx);
			const before = await store.findMember(5);
			await store.addVote({ userId: 5, fromUserId: 3, postId: 101, topicId: 10, reason: 'Bravo', plus: true, time: 1_782_900_000 });
			await store.addVote({ userId: 5, fromUserId: 2, postId: 101, topicId: 10, reason: 'Bof', plus: false, time: 1_782_900_100 });
			expect(await store.findMember(5)).toMatchObject({ plus: (before?.plus ?? 0) + 1, minus: (before?.minus ?? 0) + 1 });
			expect(await store.lastVoteTime(3, 5)).toBe(1_782_900_000);
			expect(await store.lastVoteTime(5, 3)).toBeNull();
			expect(await store.countVotes(5)).toBe(2);

			const votes = await store.listVotes(5, 0, 10);
			expect(votes.map((v) => [v.reason, v.plus, v.from?.username, v.subject])).toEqual([
				['Bof', false, 'admin', 'Postez un « vintage »'],
				['Bravo', true, 'Tessy', 'Postez un « vintage »'],
			]);

			await store.deleteVotes(5, [votes[0]?.id ?? 0]);
			expect(await store.findMember(5)).toMatchObject({ plus: 1, minus: 0 });
		});
	});
});
