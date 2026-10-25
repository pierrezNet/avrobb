/**
 * Premium sur une vraie base (PremiumRepository) : tables sans préfixe, code utilisé une fois,
 * ligne apremium créée puis mise à jour. Transactions annulées.
 */

import type { Kysely } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/db/database.ts';
import type { Database } from '../../src/db/schema.ts';
import { PremiumRepository } from '../../src/repositories/PremiumRepository.ts';
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

describe('PremiumRepository', () => {
	it('utilise un code libre et fixe puis prolonge l’expiration', async () => {
		await inRollback(async (trx) => {
			await trx
				.insertInto('acodes15')
				.values([
					{ Code: 'PV15-A', Used: 0 },
					{ Code: 'PV15-B', Used: 0 },
				])
				.execute();
			const premium = new PremiumRepository(trx);
			expect(await premium.findExpiration(3)).toBeNull();

			expect(await premium.redeemCode(3, 'acodes15', 'PV15-A', '2026-07-16')).toBe(true);
			expect(await premium.findExpiration(3)).toBe('2026-07-16');
			expect(await premium.redeemCode(5, 'acodes15', 'PV15-A', '2026-07-16')).toBe(false);
			expect(await premium.redeemCode(3, 'acodes15', 'PV15-B', '2026-07-31')).toBe(true);
			expect(await premium.findExpiration(3)).toBe('2026-07-31');

			const codes = await trx.selectFrom('acodes15').selectAll().orderBy('Code').execute();
			expect(codes).toEqual([
				{ Code: 'PV15-A', Used: 3 },
				{ Code: 'PV15-B', Used: 3 },
			]);
		});
	});
});
