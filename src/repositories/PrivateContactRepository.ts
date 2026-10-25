/**
 * Carnet d'adresses et listes d'envoi de la messagerie privée (mod APMS : pms_contacts.php,
 * pms_sending_lists.php). Toutes les écritures sont limitées aux lignes du membre.
 */

import type { Db } from '../db/database.ts';
import { GUEST_USER_ID, type PrivateContact, type SendingList } from '../domain/models.ts';
import { phpSerialize, phpUnserialize } from '../services/phpSerialize.ts';

/** Membre qu'on veut ajouter à ses contacts. */
export interface ContactCandidate {
	id: number;
	username: string;
	groupCanUsePrivateMessages: boolean;
	alreadyContact: boolean;
}

export interface PrivateContactStore {
	listContacts(userId: number): Promise<PrivateContact[]>;
	findCandidate(userId: number, target: { id: number } | { username: string }): Promise<ContactCandidate | null>;
	addContact(userId: number, contact: { id: number; username: string }, allowMessages: boolean): Promise<void>;
	/** Identifiants des membres derrière ces contacts (envoi d'un message à plusieurs contacts). */
	listContactUserIds(userId: number, contactIds: readonly number[]): Promise<number[]>;
	setAllowed(userId: number, contactIds: readonly number[], allowed: boolean): Promise<void>;
	toggleAllowed(userId: number, contactId: number): Promise<boolean>;
	deleteContacts(userId: number, contactIds: readonly number[]): Promise<number>;
}

export interface SendingListStore {
	listSendingLists(userId: number): Promise<SendingList[]>;
	findSendingList(userId: number, listId: number): Promise<SendingList | null>;
	createSendingList(userId: number, name: string, members: readonly { id: number; username: string }[]): Promise<void>;
	deleteSendingLists(userId: number, listIds: readonly number[]): Promise<number>;
}

/** Liste sérialisée par PHP (serialize() d'un tableau) ; une donnée illisible donne une liste vide. */
function unserializeList(text: string): unknown[] {
	try {
		const value = phpUnserialize(text);
		return value instanceof Map ? [...value.values()] : [];
	} catch {
		return [];
	}
}

export class PrivateContactRepository implements PrivateContactStore, SendingListStore {
	constructor(private readonly db: Db) {}

	async listContacts(userId: number): Promise<PrivateContact[]> {
		const rows = await this.db
			.selectFrom('contacts')
			.selectAll()
			.where('user_id', '=', userId)
			.orderBy('allow_msg', 'desc')
			.orderBy('contact_name')
			.execute();
		return rows.map((row) => ({ id: row.id, contactId: row.contact_id, name: row.contact_name, allowMessages: row.allow_msg === 1 }));
	}

	async findCandidate(userId: number, target: { id: number } | { username: string }): Promise<ContactCandidate | null> {
		let query = this.db
			.selectFrom('users as u')
			.innerJoin('groups as g', 'g.g_id', 'u.group_id')
			.leftJoin('contacts as c', (join) => join.onRef('c.contact_id', '=', 'u.id').on('c.user_id', '=', userId))
			.select(['u.id', 'u.username', 'g.g_pm', 'c.id as contact'])
			.where('u.id', '!=', GUEST_USER_ID);
		query = 'id' in target ? query.where('u.id', '=', target.id) : query.where('u.username', '=', target.username);
		const row = await query.executeTakeFirst();
		return row === undefined
			? null
			: { id: row.id, username: row.username, groupCanUsePrivateMessages: row.g_pm === 1, alreadyContact: row.contact !== null };
	}

	async addContact(userId: number, contact: { id: number; username: string }, allowMessages: boolean): Promise<void> {
		await this.db
			.insertInto('contacts')
			.values({ user_id: userId, contact_id: contact.id, contact_name: contact.username, allow_msg: allowMessages ? 1 : 0 })
			.execute();
	}

	async listContactUserIds(userId: number, contactIds: readonly number[]): Promise<number[]> {
		if (contactIds.length === 0) return [];
		const rows = await this.db
			.selectFrom('contacts')
			.select('contact_id')
			.where('user_id', '=', userId)
			.where('id', 'in', contactIds)
			.execute();
		return rows.map((row) => row.contact_id);
	}

	async setAllowed(userId: number, contactIds: readonly number[], allowed: boolean): Promise<void> {
		if (contactIds.length === 0) return;
		await this.db
			.updateTable('contacts')
			.set({ allow_msg: allowed ? 1 : 0 })
			.where('user_id', '=', userId)
			.where('id', 'in', contactIds)
			.execute();
	}

	async toggleAllowed(userId: number, contactId: number): Promise<boolean> {
		const result = await this.db
			.updateTable('contacts')
			.set((eb) => ({ allow_msg: eb(eb.val(1), '-', eb.ref('allow_msg')) }))
			.where('user_id', '=', userId)
			.where('id', '=', contactId)
			.executeTakeFirst();
		return Number(result.numUpdatedRows) > 0;
	}

	async deleteContacts(userId: number, contactIds: readonly number[]): Promise<number> {
		if (contactIds.length === 0) return 0;
		const result = await this.db.deleteFrom('contacts').where('user_id', '=', userId).where('id', 'in', contactIds).executeTakeFirst();
		return Number(result.numDeletedRows);
	}

	async listSendingLists(userId: number): Promise<SendingList[]> {
		const rows = await this.db.selectFrom('sending_lists').selectAll().where('user_id', '=', userId).orderBy('id', 'desc').execute();
		return rows.map(toSendingList);
	}

	async findSendingList(userId: number, listId: number): Promise<SendingList | null> {
		const row = await this.db
			.selectFrom('sending_lists')
			.selectAll()
			.where('user_id', '=', userId)
			.where('id', '=', listId)
			.executeTakeFirst();
		return row !== undefined ? toSendingList(row) : null;
	}

	async createSendingList(userId: number, name: string, members: readonly { id: number; username: string }[]): Promise<void> {
		// Format de pms_sending_lists.php : deux tableaux PHP sérialisés, pseudos et identifiants.
		await this.db
			.insertInto('sending_lists')
			.values({
				user_id: userId,
				name,
				receivers: phpSerialize(members.map((member) => member.username)),
				array_id: phpSerialize(members.map((member) => member.id)),
			})
			.execute();
	}

	async deleteSendingLists(userId: number, listIds: readonly number[]): Promise<number> {
		if (listIds.length === 0) return 0;
		const result = await this.db.deleteFrom('sending_lists').where('user_id', '=', userId).where('id', 'in', listIds).executeTakeFirst();
		return Number(result.numDeletedRows);
	}
}

function toSendingList(row: { id: number; name: string; receivers: string; array_id: string }): SendingList {
	const usernames = unserializeList(row.receivers);
	const ids = unserializeList(row.array_id);
	return {
		id: row.id,
		name: row.name,
		members: usernames.map((username, index) => ({ id: Number(ids[index] ?? 0), username: String(username) })),
	};
}
