/**
 * Messagerie privée du mod APMS (table messages, propre à Pilote-Virtuel).
 *
 * Chaque membre détient son exemplaire de chaque message d'une conversation (`owner`). Les lignes
 * d'une conversation partagent `shared_id` ; la première de chaque détenteur (show_message = 1)
 * porte la liste : dernier message (last_post*) et état lu (showed). users.num_pms compte les
 * conversations détenues : +1 à la création, -1 quand le membre la supprime.
 */

import { type RawBuilder, sql } from 'kysely';
import type { Compilable, Db } from '../db/database.ts';
import {
	GUEST_USER_ID,
	type PostAuthor,
	type PrivateConversation,
	type PrivateMessage,
	type PrivateMessageWithAuthor,
	type PrivateRecipient,
} from '../domain/models.ts';
import { markParticipantDeleted, parseParticipants } from '../services/privateMessages.ts';

export interface PrivateMessageReader {
	/** MP non lus du membre (plugins/apms/header_add2.php). */
	countUnread(userId: number): Promise<number>;
}

/** Message à enregistrer pour chaque destinataire (expéditeur compris). */
export interface OutgoingMessage {
	subject: string;
	message: string;
	hideSmilies: boolean;
	sender: { id: number; username: string; ip: string };
	recipients: readonly PrivateRecipient[];
	now: number;
}

/** Identifiant de l'exemplaire de chaque destinataire, pour les liens des notifications. */
export type SentCopies = ReadonlyMap<number, number>;

export interface PrivateMessageStore extends PrivateMessageReader {
	countConversations(ownerId: number): Promise<number>;
	listConversations(ownerId: number, offset: number, limit: number): Promise<PrivateConversation[]>;
	setConversationsRead(ownerId: number, sharedIds: readonly number[], read: boolean): Promise<void>;
	/** Le membre supprime ses conversations ; renvoie le nombre de conversations retirées. */
	leaveConversations(owner: { id: number; username: string }, sharedIds: readonly number[]): Promise<number>;
	/** Ligne de tête de la conversation chez ce membre, ou null s'il ne la détient pas. */
	findConversation(sharedId: number, ownerId: number): Promise<PrivateConversation | null>;
	findMessage(messageId: number): Promise<PrivateMessage | null>;
	countMessages(sharedId: number, ownerId: number): Promise<number>;
	listMessages(sharedId: number, ownerId: number, offset: number, limit: number): Promise<PrivateMessageWithAuthor[]>;
	/** Rang (à partir de 1) d'un message dans l'exemplaire du membre, ou null. */
	messagePosition(messageId: number, sharedId: number, ownerId: number): Promise<number | null>;
	markConversationRead(sharedId: number, ownerId: number): Promise<void>;
	/** Membres qui détiennent encore la conversation. */
	listHolders(sharedId: number): Promise<number[]>;
	findRecipientsByName(usernames: readonly string[]): Promise<PrivateRecipient[]>;
	findRecipientsById(ids: readonly number[]): Promise<PrivateRecipient[]>;
	createConversation(message: OutgoingMessage): Promise<{ sharedId: number; copies: SentCopies }>;
	reply(sharedId: number, message: OutgoingMessage): Promise<SentCopies>;
	/** Modifie toutes les copies d'un message (même conversation, même auteur, même date). */
	editMessage(message: PrivateMessage, text: string): Promise<void>;
	/** Retire un message de l'exemplaire de son détenteur. */
	deleteCopy(messageId: number, ownerId: number): Promise<void>;
	/** Retire un message de tous les exemplaires ; pour la tête, toute la conversation chez tous. */
	deleteForEverybody(message: PrivateMessage): Promise<void>;
}

/** Colonnes de users et groups d'un destinataire, avec son éventuel blocage de l'expéditeur. */
const RECIPIENT_COLUMNS = [
	'u.id',
	'u.username',
	'u.email',
	'u.group_id',
	'u.use_pm',
	'u.num_pms',
	'u.notify_pm',
	'u.notify_pm_full',
	'g.g_pm',
	'g.g_pm_limit',
] as const;

/** Dernier exemplaire inséré dans le lot en cours, et son numéro de conversation. */
const LAST_MESSAGE_ID = sql<number>`(SELECT MAX(id) FROM messages)`;
const LAST_MESSAGE_SHARED_ID = sql<number>`(SELECT shared_id FROM messages WHERE id = (SELECT MAX(id) FROM messages))`;

export class PrivateMessageRepository implements PrivateMessageStore {
	constructor(private readonly db: Db) {}

	async countUnread(userId: number): Promise<number> {
		const row = await this.db
			.selectFrom('messages')
			.select((eb) => eb.fn.countAll<number>().as('unread'))
			.where('owner', '=', userId)
			.where('showed', '=', 0)
			.where('show_message', '=', 1)
			.executeTakeFirstOrThrow();

		return Number(row.unread);
	}

	async countConversations(ownerId: number): Promise<number> {
		const row = await this.db
			.selectFrom('messages')
			.select((eb) => eb.fn.countAll<number>().as('total'))
			.where('owner', '=', ownerId)
			.where('show_message', '=', 1)
			.executeTakeFirstOrThrow();
		return Number(row.total);
	}

	#heads() {
		return this.db
			.selectFrom('messages')
			.select([
				'id',
				'shared_id',
				'subject',
				'sender',
				'sender_id',
				'receiver',
				'receiver_id',
				'last_post',
				'last_post_id',
				'last_poster',
				'showed',
			])
			.where('show_message', '=', 1);
	}

	async listConversations(ownerId: number, offset: number, limit: number): Promise<PrivateConversation[]> {
		const rows = await this.#heads()
			.where('owner', '=', ownerId)
			.orderBy('last_post', 'desc')
			.orderBy('id', 'desc')
			.limit(limit)
			.offset(offset)
			.execute();
		return rows.map(toConversation);
	}

	async setConversationsRead(ownerId: number, sharedIds: readonly number[], read: boolean): Promise<void> {
		if (sharedIds.length === 0) return;
		await this.db
			.updateTable('messages')
			.set({ showed: read ? 1 : 0 })
			.where('owner', '=', ownerId)
			.where('show_message', '=', 1)
			.where('shared_id', 'in', sharedIds)
			.execute();
	}

	async leaveConversations(owner: { id: number; username: string }, sharedIds: readonly number[]): Promise<number> {
		if (sharedIds.length === 0) return 0;
		const heads = await this.db
			.selectFrom('messages')
			.select('shared_id')
			.where('owner', '=', owner.id)
			.where('show_message', '=', 1)
			.where('shared_id', 'in', sharedIds)
			.execute();
		const left = heads.map((head) => head.shared_id);
		if (left.length === 0) return 0;

		// Les autres participants voient « pseudo (supprimé) » dans la liste des destinataires.
		const others = await this.db
			.selectFrom('messages')
			.select(['id', 'receiver'])
			.where('shared_id', 'in', left)
			.where('owner', '!=', owner.id)
			.execute();
		await this.db.batch([
			this.db.deleteFrom('messages').where('owner', '=', owner.id).where('shared_id', 'in', left),
			this.db
				.updateTable('users')
				.set((eb) => ({ num_pms: eb('num_pms', '-', left.length) }))
				.where('id', '=', owner.id)
				.where('num_pms', '>=', left.length),
			...others.flatMap((row) => {
				const receiver = markParticipantDeleted(row.receiver, owner.username);
				return receiver !== row.receiver ? [this.db.updateTable('messages').set({ receiver }).where('id', '=', row.id)] : [];
			}),
		]);
		return left.length;
	}

	async findConversation(sharedId: number, ownerId: number): Promise<PrivateConversation | null> {
		const row = await this.#heads().where('shared_id', '=', sharedId).where('owner', '=', ownerId).executeTakeFirst();
		return row !== undefined ? toConversation(row) : null;
	}

	async findMessage(messageId: number): Promise<PrivateMessage | null> {
		const row = await this.db.selectFrom('messages').selectAll().where('id', '=', messageId).executeTakeFirst();
		return row !== undefined ? toMessage(row) : null;
	}

	async countMessages(sharedId: number, ownerId: number): Promise<number> {
		const row = await this.db
			.selectFrom('messages')
			.select((eb) => eb.fn.countAll<number>().as('total'))
			.where('shared_id', '=', sharedId)
			.where('owner', '=', ownerId)
			.executeTakeFirstOrThrow();
		return Number(row.total);
	}

	async listMessages(sharedId: number, ownerId: number, offset: number, limit: number): Promise<PrivateMessageWithAuthor[]> {
		const rows = await this.db
			.selectFrom('messages as m')
			.leftJoin('users as u', 'u.id', 'm.sender_id')
			.leftJoin('groups as g', 'g.g_id', 'u.group_id')
			.leftJoin('online as o', (join) => join.onRef('o.user_id', '=', 'u.id').on('o.user_id', '!=', GUEST_USER_ID).on('o.idle', '=', 0))
			.selectAll('m')
			.select([
				'u.id as user_id',
				'u.email',
				'u.title',
				'u.url',
				'u.location',
				'u.signature',
				'u.email_setting',
				'u.num_posts',
				'u.registered',
				'u.admin_note',
				'u.use_pm',
				'u.rep_plus',
				'u.rep_minus',
				'u.reputation_enable',
				'g.g_pm',
				'g.g_id',
				'g.g_user_title',
				'o.user_id as online_user_id',
			])
			.where('m.shared_id', '=', sharedId)
			.where('m.owner', '=', ownerId)
			.orderBy('m.posted')
			.orderBy('m.id')
			.limit(limit)
			.offset(offset)
			.execute();

		return rows.map((row) => {
			const author: PostAuthor | null =
				row.user_id === null || row.user_id === GUEST_USER_ID
					? null
					: {
							id: row.user_id,
							email: row.email ?? '',
							title: row.title ?? '',
							url: row.url ?? '',
							location: row.location ?? '',
							signature: row.signature ?? '',
							emailSetting: row.email_setting ?? 2,
							numPosts: row.num_posts ?? 0,
							registered: row.registered ?? 0,
							adminNote: row.admin_note ?? '',
							groupId: row.g_id ?? 0,
							groupUserTitle: row.g_user_title ?? '',
							isOnline: row.online_user_id === row.user_id,
							acceptsPrivateMessages: row.use_pm === 1 && row.g_pm === 1,
							reputationPlus: row.rep_plus ?? 0,
							reputationMinus: row.rep_minus ?? 0,
							reputationEnabled: row.reputation_enable === 1,
						};
			return { ...toMessage(row), author };
		});
	}

	async messagePosition(messageId: number, sharedId: number, ownerId: number): Promise<number | null> {
		const rows = await this.db
			.selectFrom('messages')
			.select('id')
			.where('shared_id', '=', sharedId)
			.where('owner', '=', ownerId)
			.orderBy('posted')
			.orderBy('id')
			.execute();
		const index = rows.findIndex((row) => row.id === messageId);
		return index >= 0 ? index + 1 : null;
	}

	async markConversationRead(sharedId: number, ownerId: number): Promise<void> {
		await this.setConversationsRead(ownerId, [sharedId], true);
	}

	async listHolders(sharedId: number): Promise<number[]> {
		const rows = await this.db
			.selectFrom('messages')
			.select('owner')
			.where('shared_id', '=', sharedId)
			.where('show_message', '=', 1)
			.execute();
		return [...new Set(rows.map((row) => row.owner))];
	}

	#recipients() {
		return this.db
			.selectFrom('users as u')
			.innerJoin('groups as g', 'g.g_id', 'u.group_id')
			.select(RECIPIENT_COLUMNS)
			.where('u.id', '!=', GUEST_USER_ID);
	}

	async findRecipientsByName(usernames: readonly string[]): Promise<PrivateRecipient[]> {
		if (usernames.length === 0) return [];
		const rows = await this.#recipients().where('u.username', 'in', usernames).execute();
		return rows.map(toRecipient);
	}

	async findRecipientsById(ids: readonly number[]): Promise<PrivateRecipient[]> {
		if (ids.length === 0) return [];
		const rows = await this.#recipients().where('u.id', 'in', ids).execute();
		return rows.map(toRecipient);
	}

	/**
	 * Nouvelle conversation : un exemplaire par participant, dans un seul lot. Le numéro de conversation
	 * (pms_send.php : le plus grand last_shared_id ou shared_id + 1) est calculé dans le lot même, ce
	 * qui remplace le verrou du PHP ; les exemplaires suivants reprennent celui de la ligne précédente.
	 */
	async createConversation(message: OutgoingMessage): Promise<{ sharedId: number; copies: SentCopies }> {
		const nextShared = sql<number>`(SELECT MAX(COALESCE(MAX(last_shared_id), 0), COALESCE(MAX(shared_id), 0)) + 1 FROM messages)`;
		const writes: Compilable[] = message.recipients.flatMap((recipient, index) => {
			const sharedId = index === 0 ? nextShared : LAST_MESSAGE_SHARED_ID;
			return [
				this.db.insertInto('messages').values({
					...rowValues(message, sharedId, recipient.id),
					last_shared_id: sharedId,
					show_message: 1,
					showed: recipient.id === message.sender.id ? 1 : 0,
					last_post: message.now,
					last_poster: message.sender.username,
				}),
				this.db.updateTable('messages').set({ last_post_id: sql`id` }).where('id', '=', LAST_MESSAGE_ID),
				this.db
					.updateTable('users')
					.set((eb) => ({ num_pms: eb('num_pms', '+', 1) }))
					.where('id', '=', recipient.id),
			];
		});
		const results = await this.db.batch([
			...writes,
			this.db.updateTable('users').set({ last_post: message.now }).where('id', '=', message.sender.id),
			this.db.selectFrom('messages').select(['id', 'owner', 'shared_id']).where('shared_id', '=', LAST_MESSAGE_SHARED_ID),
		]);
		const rows = (results.at(-1)?.rows ?? []) as { id: number; owner: number; shared_id: number }[];
		return { sharedId: rows[0]?.shared_id ?? 0, copies: new Map(rows.map((row) => [row.owner, row.id])) };
	}

	/** Réponse : un exemplaire par participant ; la tête de chacun pointe sur son nouvel exemplaire. */
	async reply(sharedId: number, message: OutgoingMessage): Promise<SentCopies> {
		const writes: Compilable[] = message.recipients.flatMap((recipient) => [
			this.db
				.insertInto('messages')
				.values({ ...rowValues(message, sharedId, recipient.id), show_message: 0, showed: recipient.id === message.sender.id ? 1 : 0 }),
			this.db
				.updateTable('messages')
				.set({
					last_post_id: LAST_MESSAGE_ID,
					last_post: message.now,
					last_poster: message.sender.username,
					// Nouveau message : non lu pour les autres participants.
					...(recipient.id !== message.sender.id ? { showed: 0 } : {}),
				})
				.where('shared_id', '=', sharedId)
				.where('show_message', '=', 1)
				.where('owner', '=', recipient.id),
		]);
		const results = await this.db.batch([
			...writes,
			this.db.updateTable('users').set({ last_post: message.now }).where('id', '=', message.sender.id),
			this.db
				.selectFrom('messages')
				.select((eb) => ['owner', eb.fn.max('id').as('id')])
				.where('shared_id', '=', sharedId)
				.where('show_message', '=', 0)
				.where('sender_id', '=', message.sender.id)
				.where('posted', '=', message.now)
				.groupBy('owner'),
		]);
		const rows = (results.at(-1)?.rows ?? []) as { owner: number; id: number }[];
		return new Map(rows.map((row) => [row.owner, row.id]));
	}

	async editMessage(message: PrivateMessage, text: string): Promise<void> {
		await this.db
			.updateTable('messages')
			.set({ message: text })
			.where('shared_id', '=', message.sharedId)
			.where('sender_id', '=', message.senderId)
			.where('posted', '=', message.posted)
			.execute();
	}

	async deleteCopy(messageId: number, ownerId: number): Promise<void> {
		await this.db.deleteFrom('messages').where('id', '=', messageId).where('owner', '=', ownerId).where('show_message', '=', 0).execute();
	}

	async deleteForEverybody(message: PrivateMessage): Promise<void> {
		if (!message.isHead) {
			await this.db
				.deleteFrom('messages')
				.where('shared_id', '=', message.sharedId)
				.where('sender_id', '=', message.senderId)
				.where('posted', '=', message.posted)
				.where('show_message', '=', 0)
				.execute();
			return;
		}
		const holders = await this.db
			.selectFrom('messages')
			.select('owner')
			.where('shared_id', '=', message.sharedId)
			.where('show_message', '=', 1)
			.execute();
		const owners = [...new Set(holders.map((row) => row.owner))];
		await this.db.batch([
			this.db.deleteFrom('messages').where('shared_id', '=', message.sharedId),
			...(owners.length > 0
				? [
						this.db
							.updateTable('users')
							.set((eb) => ({ num_pms: eb('num_pms', '-', 1) }))
							.where('id', 'in', owners)
							.where('num_pms', '>', 0),
					]
				: []),
		]);
	}
}

/** Colonnes communes à tous les exemplaires d'un envoi. */
function rowValues(message: OutgoingMessage, sharedId: number | RawBuilder<number>, ownerId: number) {
	return {
		shared_id: sharedId,
		owner: ownerId,
		subject: message.subject,
		message: message.message,
		sender: message.sender.username,
		sender_id: message.sender.id,
		receiver: message.recipients.map((r) => r.username).join(', '),
		receiver_id: message.recipients.map((r) => r.id).join(', '),
		sender_ip: message.sender.ip,
		hide_smilies: message.hideSmilies ? 1 : 0,
		posted: message.now,
	};
}

function toConversation(row: {
	id: number;
	shared_id: number;
	subject: string;
	sender: string;
	sender_id: number;
	receiver: string;
	receiver_id: string;
	last_post: number;
	last_post_id: number;
	last_poster: string;
	showed: number;
}): PrivateConversation {
	return {
		sharedId: row.shared_id,
		messageId: row.id,
		subject: row.subject,
		sender: row.sender,
		senderId: row.sender_id,
		participants: parseParticipants(row.receiver, row.receiver_id),
		lastPost: row.last_post > 0 ? { postedAt: row.last_post, postId: row.last_post_id, poster: row.last_poster } : null,
		unread: row.showed === 0,
	};
}

function toMessage(row: {
	id: number;
	shared_id: number;
	owner: number;
	show_message: number;
	subject: string;
	message: string | null;
	hide_smilies: number;
	posted: number;
	sender_id: number;
	sender: string;
	sender_ip: string;
}): PrivateMessage {
	return {
		id: row.id,
		sharedId: row.shared_id,
		ownerId: row.owner,
		isHead: row.show_message === 1,
		subject: row.subject,
		message: row.message ?? '',
		hideSmilies: row.hide_smilies === 1,
		posted: row.posted,
		senderId: row.sender_id,
		sender: row.sender,
		senderIp: row.sender_ip,
	};
}

function toRecipient(row: {
	id: number;
	username: string;
	email: string;
	group_id: number;
	use_pm: number;
	num_pms: number;
	notify_pm: number;
	notify_pm_full: number;
	g_pm: number;
	g_pm_limit: number;
}): PrivateRecipient {
	return {
		id: row.id,
		username: row.username,
		email: row.email,
		groupId: row.group_id,
		usesPrivateMessages: row.use_pm === 1,
		groupCanUsePrivateMessages: row.g_pm === 1,
		privateMessageLimit: row.g_pm_limit,
		privateMessageCount: row.num_pms,
		notifyPrivateMessages: row.notify_pm === 1,
		notifyPrivateMessagesFull: row.notify_pm_full === 1,
	};
}
