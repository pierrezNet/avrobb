/**
 * Doublures en mémoire de la messagerie privée : table messages, contacts et listes d'envoi, avec
 * les mêmes règles que les repositories (exemplaire par détenteur, tête de conversation, num_pms).
 */

import type { PrivateContact, PrivateMessage, PrivateRecipient, SendingList } from '../src/domain/models.ts';
import type { PrivateContactStore, SendingListStore } from '../src/repositories/PrivateContactRepository.ts';
import type { OutgoingMessage, PrivateMessageStore } from '../src/repositories/PrivateMessageRepository.ts';
import { markParticipantDeleted, parseParticipants } from '../src/services/privateMessages.ts';

export interface PmRow extends PrivateMessage {
	receiver: string;
	receiverId: string;
	lastPost: number;
	lastPostId: number;
	lastPoster: string;
	showed: boolean;
}

export interface PmData {
	rows: PmRow[];
	/** Membres joignables, avec leur compteur num_pms (modifié en place). */
	members: PrivateRecipient[];
	/** Blocages : « destinataire→expéditeur ». */
	blocked: Set<string>;
	contacts: (PrivateContact & { userId: number })[];
	lists: (SendingList & { userId: number })[];
	nextId: number;
}

export function pmData(overrides: Partial<PmData> = {}): PmData {
	return { rows: [], members: [], blocked: new Set(), contacts: [], lists: [], nextId: 500, ...overrides };
}

const member = (data: PmData, id: number) => data.members.find((m) => m.id === id);

function adjust(data: PmData, userId: number, delta: number): void {
	const found = member(data, userId);
	if (found !== undefined) found.privateMessageCount = Math.max(0, found.privateMessageCount + delta);
}

function insert(data: PmData, message: OutgoingMessage, sharedId: number, ownerId: number, isHead: boolean): PmRow {
	const row: PmRow = {
		id: data.nextId++,
		sharedId,
		ownerId,
		isHead,
		subject: message.subject,
		message: message.message,
		hideSmilies: message.hideSmilies,
		posted: message.now,
		senderId: message.sender.id,
		sender: message.sender.username,
		senderIp: message.sender.ip,
		receiver: message.recipients.map((r) => r.username).join(', '),
		receiverId: message.recipients.map((r) => r.id).join(', '),
		lastPost: message.now,
		lastPostId: 0,
		lastPoster: message.sender.username,
		showed: ownerId === message.sender.id,
	};
	data.rows.push(row);
	return row;
}

function toConversation(row: PmRow) {
	return {
		sharedId: row.sharedId,
		messageId: row.id,
		subject: row.subject,
		sender: row.sender,
		senderId: row.senderId,
		participants: parseParticipants(row.receiver, row.receiverId),
		lastPost: { postedAt: row.lastPost, postId: row.lastPostId, poster: row.lastPoster },
		unread: !row.showed,
	};
}

const recipient = (data: PmData, senderId: number) => (m: PrivateRecipient) => ({
	...m,
	blocksSender: data.blocked.has(`${m.id}→${senderId}`),
});

export function fakePrivateMessageStore(data: PmData): PrivateMessageStore {
	const heads = (ownerId: number) => data.rows.filter((r) => r.ownerId === ownerId && r.isHead);
	const copiesOf = (sharedId: number, ownerId: number) =>
		data.rows.filter((r) => r.sharedId === sharedId && r.ownerId === ownerId).sort((a, b) => a.posted - b.posted || a.id - b.id);
	return {
		countUnread: async (userId) => heads(userId).filter((r) => !r.showed).length,
		countConversations: async (ownerId) => heads(ownerId).length,
		listConversations: async (ownerId, offset, limit) =>
			heads(ownerId)
				.sort((a, b) => b.lastPost - a.lastPost || b.id - a.id)
				.slice(offset, offset + limit)
				.map(toConversation),
		setConversationsRead: async (ownerId, sharedIds, read) => {
			for (const row of heads(ownerId)) if (sharedIds.includes(row.sharedId)) row.showed = read;
		},
		leaveConversations: async (owner, sharedIds) => {
			const left = heads(owner.id)
				.filter((r) => sharedIds.includes(r.sharedId))
				.map((r) => r.sharedId);
			data.rows = data.rows.filter((r) => !(r.ownerId === owner.id && left.includes(r.sharedId)));
			for (const row of data.rows) if (left.includes(row.sharedId)) row.receiver = markParticipantDeleted(row.receiver, owner.username);
			adjust(data, owner.id, -left.length);
			return left.length;
		},
		findConversation: async (sharedId, ownerId) => {
			const head = heads(ownerId).find((r) => r.sharedId === sharedId);
			return head !== undefined ? toConversation(head) : null;
		},
		findMessage: async (id) => data.rows.find((r) => r.id === id) ?? null,
		countMessages: async (sharedId, ownerId) => copiesOf(sharedId, ownerId).length,
		listMessages: async (sharedId, ownerId, offset, limit) =>
			copiesOf(sharedId, ownerId)
				.slice(offset, offset + limit)
				.map((row) => ({ ...row, author: null })),
		messagePosition: async (messageId, sharedId, ownerId) => {
			const index = copiesOf(sharedId, ownerId).findIndex((r) => r.id === messageId);
			return index >= 0 ? index + 1 : null;
		},
		markConversationRead: async (sharedId, ownerId) => {
			for (const row of heads(ownerId)) if (row.sharedId === sharedId) row.showed = true;
		},
		listHolders: async (sharedId) => [...new Set(data.rows.filter((r) => r.sharedId === sharedId && r.isHead).map((r) => r.ownerId))],
		findRecipientsByName: async (usernames, senderId) =>
			data.members.filter((m) => usernames.some((name) => name.toLowerCase() === m.username.toLowerCase())).map(recipient(data, senderId)),
		findRecipientsById: async (ids, senderId) => data.members.filter((m) => ids.includes(m.id)).map(recipient(data, senderId)),
		createConversation: async (message) => {
			const sharedId = Math.max(0, ...data.rows.map((r) => r.sharedId)) + 1;
			const copies = new Map<number, number>();
			for (const r of message.recipients) {
				const row = insert(data, message, sharedId, r.id, true);
				row.lastPostId = row.id;
				copies.set(r.id, row.id);
				adjust(data, r.id, 1);
			}
			return { sharedId, copies };
		},
		reply: async (sharedId, message) => {
			const copies = new Map<number, number>();
			for (const r of message.recipients) {
				const row = insert(data, message, sharedId, r.id, false);
				copies.set(r.id, row.id);
				const head = heads(r.id).find((h) => h.sharedId === sharedId);
				if (head !== undefined) {
					Object.assign(head, { lastPost: message.now, lastPostId: row.id, lastPoster: message.sender.username });
					if (r.id !== message.sender.id) head.showed = false;
				}
			}
			return copies;
		},
		editMessage: async (message, text) => {
			for (const row of data.rows)
				if (row.sharedId === message.sharedId && row.senderId === message.senderId && row.posted === message.posted) row.message = text;
		},
		deleteCopy: async (messageId, ownerId) => {
			data.rows = data.rows.filter((r) => !(r.id === messageId && r.ownerId === ownerId && !r.isHead));
		},
		deleteForEverybody: async (message) => {
			if (!message.isHead) {
				data.rows = data.rows.filter(
					(r) => !(r.sharedId === message.sharedId && r.senderId === message.senderId && r.posted === message.posted && !r.isHead),
				);
				return;
			}
			const owners = new Set(data.rows.filter((r) => r.sharedId === message.sharedId && r.isHead).map((r) => r.ownerId));
			data.rows = data.rows.filter((r) => r.sharedId !== message.sharedId);
			for (const owner of owners) adjust(data, owner, -1);
		},
	};
}

export function fakePrivateContacts(data: PmData): PrivateContactStore & SendingListStore {
	const own = (userId: number) => data.contacts.filter((c) => c.userId === userId);
	return {
		listContacts: async (userId) => own(userId).map(({ userId: _, ...contact }) => contact),
		findCandidate: async (userId, target) => {
			const found = data.members.find((m) => ('id' in target ? m.id === target.id : m.username === target.username));
			return found === undefined
				? null
				: {
						id: found.id,
						username: found.username,
						groupCanUsePrivateMessages: found.groupCanUsePrivateMessages,
						alreadyContact: own(userId).some((c) => c.contactId === found.id),
					};
		},
		addContact: async (userId, contact, allowMessages) => {
			data.contacts.push({ id: data.nextId++, userId, contactId: contact.id, name: contact.username, allowMessages });
		},
		listContactUserIds: async (userId, ids) =>
			own(userId)
				.filter((c) => ids.includes(c.id))
				.map((c) => c.contactId),
		setAllowed: async (userId, ids, allowed) => {
			for (const c of own(userId)) if (ids.includes(c.id)) c.allowMessages = allowed;
		},
		toggleAllowed: async (userId, id) => {
			const found = own(userId).find((c) => c.id === id);
			if (found !== undefined) found.allowMessages = !found.allowMessages;
			return found !== undefined;
		},
		deleteContacts: async (userId, ids) => {
			const before = data.contacts.length;
			data.contacts = data.contacts.filter((c) => !(c.userId === userId && ids.includes(c.id)));
			return before - data.contacts.length;
		},
		listSendingLists: async (userId) => data.lists.filter((l) => l.userId === userId).map(({ userId: _, ...list }) => list),
		findSendingList: async (userId, id) => {
			const found = data.lists.find((l) => l.userId === userId && l.id === id);
			return found === undefined ? null : { id: found.id, name: found.name, members: found.members };
		},
		createSendingList: async (userId, name, members) => {
			data.lists.push({ id: data.nextId++, userId, name, members: [...members] });
		},
		deleteSendingLists: async (userId, ids) => {
			const before = data.lists.length;
			data.lists = data.lists.filter((l) => !(l.userId === userId && ids.includes(l.id)));
			return before - data.lists.length;
		},
	};
}
