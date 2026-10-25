/**
 * Messagerie privée sur une vraie base (PrivateMessageRepository, PrivateContactRepository) :
 * création et réponse, num_pms, départ d'une conversation, suppression pour tous, contacts et
 * listes d'envoi au format sérialisé du PHP. Chaque test s'exécute dans une transaction annulée.
 */

import type { Kysely } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/db/database.ts';
import type { Database } from '../../src/db/schema.ts';
import { PrivateContactRepository } from '../../src/repositories/PrivateContactRepository.ts';
import { PrivateMessageRepository } from '../../src/repositories/PrivateMessageRepository.ts';
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

const numPms = async (trx: Kysely<Database>, id: number): Promise<number> =>
	(await trx.selectFrom('users').select('num_pms').where('id', '=', id).executeTakeFirstOrThrow()).num_pms;

describe('PrivateMessageRepository', () => {
	it('crée une conversation, y répond, puis un participant la quitte', async () => {
		await inRollback(async (trx) => {
			const store = new PrivateMessageRepository(trx);
			const recipients = await store.findRecipientsByName(['MaxDUO', 'tessy'], 3);
			expect(recipients.map((r) => r.username).sort()).toEqual(['MaxDUO', 'Tessy']);
			const before = { tessy: await numPms(trx, 3), max: await numPms(trx, 5) };

			const sender = { id: 3, username: 'Tessy', ip: '192.0.2.1' };
			const { sharedId, copies } = await store.createConversation({
				subject: 'Vol de nuit',
				message: 'Départ 21 h',
				hideSmilies: false,
				sender,
				recipients,
				now: 1_782_900_100,
			});
			// Le seed contient déjà les conversations 1 à 4.
			expect(sharedId).toBe(5);
			expect(await numPms(trx, 3)).toBe(before.tessy + 1);
			expect(await numPms(trx, 5)).toBe(before.max + 1);
			const maxHead = await store.findConversation(sharedId, 5);
			expect(maxHead).toMatchObject({ subject: 'Vol de nuit', unread: true, messageId: copies.get(5) });
			expect(maxHead?.participants.map((p) => p.username)).toEqual(recipients.map((r) => r.username));

			const replies = await store.reply(sharedId, {
				subject: 'Vol de nuit',
				message: 'Ok',
				hideSmilies: false,
				sender: { id: 5, username: 'MaxDUO', ip: '' },
				recipients,
				now: 1_782_900_200,
			});
			expect(await store.countMessages(sharedId, 3)).toBe(2);
			const tessyHead = await store.findConversation(sharedId, 3);
			expect(tessyHead).toMatchObject({ unread: true, lastPost: { postedAt: 1_782_900_200, poster: 'MaxDUO', postId: replies.get(3) } });
			expect(await store.messagePosition(replies.get(3) ?? 0, sharedId, 3)).toBe(2);
			expect((await store.listMessages(sharedId, 3, 0, 10)).map((m) => [m.sender, m.author?.id])).toEqual([
				['Tessy', 3],
				['MaxDUO', 5],
			]);

			expect(await store.leaveConversations({ id: 5, username: 'MaxDUO' }, [sharedId, 999])).toBe(1);
			expect(await store.countMessages(sharedId, 5)).toBe(0);
			expect(await numPms(trx, 5)).toBe(before.max);
			expect((await store.findConversation(sharedId, 3))?.participants.find((p) => p.id === 5)?.deleted).toBe(true);
			expect(await store.listHolders(sharedId)).toEqual([3]);
		});
	});

	it('marque lu ou non lu, et supprime une conversation pour tous', async () => {
		await inRollback(async (trx) => {
			const store = new PrivateMessageRepository(trx);
			await store.setConversationsRead(3, [1, 2], true);
			expect(await store.countUnread(3)).toBe(0);
			await store.setConversationsRead(3, [1], false);
			expect(await store.countUnread(3)).toBe(1);

			const head = await store.findConversation(1, 3);
			const message = await store.findMessage(head?.messageId ?? 0);
			const before = await numPms(trx, 2);
			if (message === null) throw new Error('message 1 attendu');
			await store.deleteForEverybody(message);
			expect(await store.findConversation(1, 2)).toBeNull();
			expect(await numPms(trx, 2)).toBe(Math.max(0, before - 1));
		});
	});

	it('lit le blocage de l’expéditeur dans les contacts du destinataire', async () => {
		await inRollback(async (trx) => {
			await trx.insertInto('contacts').values({ user_id: 5, contact_id: 3, contact_name: 'Tessy', allow_msg: 0 }).execute();
			const [max] = await new PrivateMessageRepository(trx).findRecipientsById([5], 3);
			expect(max?.blocksSender).toBe(true);
			const [other] = await new PrivateMessageRepository(trx).findRecipientsById([5], 2);
			expect(other?.blocksSender).toBe(false);
		});
	});
});

describe('PrivateContactRepository', () => {
	it('contacts : ajout, droits, suppression limités au membre', async () => {
		await inRollback(async (trx) => {
			const store = new PrivateContactRepository(trx);
			const candidate = await store.findCandidate(3, { username: 'MaxDUO' });
			expect(candidate).toMatchObject({ id: 5, alreadyContact: false, groupCanUsePrivateMessages: true });
			await store.addContact(3, { id: 5, username: 'MaxDUO' }, true);
			expect((await store.findCandidate(3, { id: 5 }))?.alreadyContact).toBe(true);

			const [contact] = await store.listContacts(3);
			expect(contact).toMatchObject({ contactId: 5, name: 'MaxDUO', allowMessages: true });
			expect(await store.toggleAllowed(5, contact?.id ?? 0)).toBe(false);
			expect(await store.toggleAllowed(3, contact?.id ?? 0)).toBe(true);
			expect((await store.listContacts(3))[0]?.allowMessages).toBe(false);
			expect(await store.listContactUserIds(3, [contact?.id ?? 0])).toEqual([5]);
			expect(await store.deleteContacts(5, [contact?.id ?? 0])).toBe(0);
			expect(await store.deleteContacts(3, [contact?.id ?? 0])).toBe(1);
		});
	});

	it('listes d’envoi sérialisées comme le PHP', async () => {
		await inRollback(async (trx) => {
			const store = new PrivateContactRepository(trx);
			await store.createSendingList(3, 'Escadrille', [
				{ id: 5, username: 'MaxDUO' },
				{ id: 2, username: 'admin' },
			]);
			const row = await trx.selectFrom('sending_lists').selectAll().where('user_id', '=', 3).executeTakeFirstOrThrow();
			expect(row.receivers).toBe('a:2:{i:0;s:6:"MaxDUO";i:1;s:5:"admin";}');
			expect(row.array_id).toBe('a:2:{i:0;i:5;i:1;i:2;}');
			expect(await store.findSendingList(3, row.id)).toEqual({
				id: row.id,
				name: 'Escadrille',
				members: [
					{ id: 5, username: 'MaxDUO' },
					{ id: 2, username: 'admin' },
				],
			});
			expect(await store.findSendingList(5, row.id)).toBeNull();
			expect(await store.deleteSendingLists(3, [row.id])).toBe(1);
		});
	});
});
