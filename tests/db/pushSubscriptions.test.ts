/**
 * Abonnements push (PushSubscriptionRepository) sur une vraie base : un appareil par adresse,
 * destinataires selon leurs préférences, suppression avec le compte.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { AccountRepository } from '../../src/repositories/AccountRepository.ts';
import { PushSubscriptionRepository } from '../../src/repositories/PushSubscriptionRepository.ts';
import { closeTestDatabase, inRollback } from './testDb.ts';

afterAll(closeTestDatabase);

const keys = { p256dh: 'p'.repeat(20), auth: 'a'.repeat(20) };
const endpoint = (name: string) => `https://fcm.googleapis.com/fcm/send/${name}`;

describe('PushSubscriptionRepository', () => {
	it('un appareil par adresse, repris par le membre connecté ; destinataires selon leurs préférences', async () => {
		await inRollback(async (trx) => {
			const store = new PushSubscriptionRepository(trx);
			await store.save(3, { endpoint: endpoint('a'), ...keys }, 'fr', 1);
			await store.save(3, { endpoint: endpoint('b'), ...keys }, 'en', 1);
			await store.save(5, { endpoint: endpoint('c'), ...keys }, 'fr', 1);
			// Même navigateur, autre compte : l'abonnement change de membre.
			await store.save(5, { endpoint: endpoint('b'), ...keys }, 'en', 2);
			const all = await store.listRecipients([3, 5], 'pm');
			expect(all.map((row) => `${row.userId} ${row.endpoint.slice(-1)} ${row.locale}`).sort()).toEqual(['3 a fr', '5 b en', '5 c fr']);

			await trx.updateTable('users').set({ push_replies: 0 }).where('id', '=', 5).execute();
			expect((await store.listRecipients([3, 5], 'replies')).map((row) => row.userId)).toEqual([3]);

			await store.remove(3, endpoint('c'));
			await store.removeEndpoint(endpoint('a'));
			expect((await store.listRecipients([3, 5], 'pm')).map((row) => row.endpoint.slice(-1)).sort()).toEqual(['b', 'c']);
		});
	});

	it('effacés avec le compte du membre', async () => {
		await inRollback(async (trx) => {
			const store = new PushSubscriptionRepository(trx);
			await store.save(3, { endpoint: endpoint('a'), ...keys }, 'fr', 1);
			await new AccountRepository(trx).deleteAccount(3, 'Tessy', 'Membre supprimé');
			expect(await trx.selectFrom('push_subscriptions').select('id').execute()).toEqual([]);
		});
	});
});
