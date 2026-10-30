/**
 * Modification des profils (profile.php) : lecture complète d'un membre, mise à jour de ses champs,
 * renommage avec tous ses effets de bord.
 */

import type { Updateable } from 'kysely';
import type { Compilable, Db } from '../db/database.ts';
import type { UsersTable } from '../db/schema.ts';
import { type EditableProfile, GUEST_USER_ID, type ProfileChanges } from '../domain/models.ts';
import { parseModerators, serializeModerators } from '../services/moderators.ts';
import { escapeLike, likeEscaped } from './like.ts';

export interface ProfileStore {
	findEditableProfile(userId: number): Promise<EditableProfile | null>;
	updateProfile(userId: number, changes: ProfileChanges): Promise<void>;
	/**
	 * Enregistrement de la section Principal avec renommage (profile.php et
	 * plugins/apms/profile_add6.php), en une transaction : bannissements, messages, sujets, forums,
	 * présence, listes de modérateurs, messagerie privée. Indique si des bannissements ont changé.
	 */
	renameUser(userId: number, oldUsername: string, newUsername: string, changes: ProfileChanges): Promise<{ bansUpdated: boolean }>;
	/** Autre membre au pseudo identique ou ressemblant (check_username() avec l'id du membre renommé). */
	findSimilarUsername(username: string, skeleton: string, excludeUserId: number): Promise<string | null>;
	/** Pseudos des autres membres qui utilisent cette adresse. */
	listUsernamesByEmail(email: string, excludeUserId: number): Promise<string[]>;
}

type UserColumns = Omit<Updateable<UsersTable>, 'id'>;

/** Une chaîne vide devient NULL, comme la boucle « Single quotes around non-empty values » du PHP. */
const nullable = (value: string): string | null => (value !== '' ? value : null);
const bit = (value: boolean): number => (value ? 1 : 0);

/** ProfileChanges (domaine) → colonnes de users. */
function toColumns(changes: ProfileChanges): UserColumns {
	const columns: UserColumns = {};
	const set = <K extends keyof UserColumns>(column: K, value: UserColumns[K] | undefined): void => {
		if (value !== undefined) columns[column] = value;
	};
	const text = (value: string | undefined): string | null | undefined => (value === undefined ? undefined : nullable(value));
	const flag = (value: boolean | undefined): number | undefined => (value === undefined ? undefined : bit(value));

	if (changes.email !== undefined) columns.email = changes.email;
	set('title', text(changes.title));
	set('realname', text(changes.realname));
	set('url', text(changes.url));
	set('location', text(changes.location));
	set('jabber', text(changes.jabber));
	set('icq', text(changes.icq));
	set('msn', text(changes.msn));
	set('aim', text(changes.aim));
	set('yahoo', text(changes.yahoo));
	set('signature', text(changes.signature));
	set('admin_note', text(changes.adminNote));
	set('num_posts', changes.numPosts);
	set('disp_topics', changes.topicsPerPage);
	set('disp_posts', changes.postsPerPage);
	set('timezone', changes.timezone);
	set('dst', flag(changes.dst));
	set('style', changes.style);
	set('email_setting', changes.emailSetting);
	set('notify_with_post', flag(changes.notifyWithPost));
	set('auto_notify', flag(changes.autoNotify));
	set('use_pm', flag(changes.usesPrivateMessages));
	set('notify_pm', flag(changes.notifyPrivateMessages));
	set('notify_pm_full', flag(changes.notifyPrivateMessagesFull));
	set('show_smilies', flag(changes.showSmilies));
	set('show_img', flag(changes.showImages));
	set('show_img_sig', flag(changes.showSignatureImages));
	set('show_avatars', flag(changes.showAvatars));
	set('show_sig', flag(changes.showSignatures));
	set('reputation_enable', flag(changes.reputationEnabled));
	set('username_changed', flag(changes.usernameChanged));
	return columns;
}

/** utf8_strcasecmp() : tri des listes de modérateurs par pseudo, sans tenir compte de la casse. */
const caseInsensitive = (a: string, b: string): number => {
	const x = a.toLowerCase();
	const y = b.toLowerCase();
	return x < y ? -1 : x > y ? 1 : 0;
};

/** Remplace un pseudo dans une liste « a, b, c » (messages.receiver), élément par élément. */
export function renameInList(list: string, oldUsername: string, newUsername: string): string {
	return list
		.split(', ')
		.map((name) => (name === oldUsername ? newUsername : name))
		.join(', ');
}

export class ProfileRepository implements ProfileStore {
	constructor(private readonly db: Db) {}

	async findEditableProfile(userId: number): Promise<EditableProfile | null> {
		const row = await this.db
			.selectFrom('users as u')
			.leftJoin('groups as g', 'g.g_id', 'u.group_id')
			.selectAll('u')
			.select(['g.g_user_title', 'g.g_moderator', 'g.g_pm'])
			.where('u.id', '=', userId)
			.where('u.id', '>', GUEST_USER_ID)
			.executeTakeFirst();
		if (row === undefined) return null;

		return {
			id: row.id,
			username: row.username,
			email: row.email,
			emailSetting: row.email_setting,
			title: row.title ?? '',
			realname: row.realname ?? '',
			url: row.url ?? '',
			location: row.location ?? '',
			jabber: row.jabber ?? '',
			icq: row.icq ?? '',
			msn: row.msn ?? '',
			aim: row.aim ?? '',
			yahoo: row.yahoo ?? '',
			signature: row.signature ?? '',
			numPosts: row.num_posts,
			lastPost: row.last_post !== null && row.last_post > 0 ? row.last_post : null,
			registered: row.registered,
			groupId: row.group_id,
			groupUserTitle: row.g_user_title ?? '',
			groupIsModerator: row.g_moderator === 1,
			acceptsPrivateMessages: row.use_pm === 1 && row.g_pm === 1,
			topicsPerPage: row.disp_topics,
			postsPerPage: row.disp_posts,
			timezone: row.timezone,
			dst: row.dst === 1,
			style: row.style,
			notifyWithPost: row.notify_with_post === 1,
			autoNotify: row.auto_notify === 1,
			usesPrivateMessages: row.use_pm === 1,
			notifyPrivateMessages: row.notify_pm === 1,
			notifyPrivateMessagesFull: row.notify_pm_full === 1,
			showSmilies: row.show_smilies === 1,
			showImages: row.show_img === 1,
			showSignatureImages: row.show_img_sig === 1,
			showAvatars: row.show_avatars === 1,
			showSignatures: row.show_sig === 1,
			reputationEnabled: row.reputation_enable === 1,
			registrationIp: row.registration_ip,
			adminNote: row.admin_note ?? '',
			lastVisit: row.last_visit,
			usernameChanged: row.username_changed === 1,
		};
	}

	async updateProfile(userId: number, changes: ProfileChanges): Promise<void> {
		const columns = toColumns(changes);
		if (Object.keys(columns).length === 0) return;
		await this.db.updateTable('users').set(columns).where('id', '=', userId).execute();
	}

	async renameUser(userId: number, oldUsername: string, newUsername: string, changes: ProfileChanges): Promise<{ bansUpdated: boolean }> {
		// Lectures d'abord : destinataires des MP et listes de modérateurs à réécrire.
		const received = await this.db
			.selectFrom('messages')
			.select(['id', 'receiver'])
			.where(likeEscaped('receiver', `%${escapeLike(oldUsername)}%`))
			.execute();
		const forums = await this.db.selectFrom('forums').select(['id', 'moderators']).where('moderators', 'is not', null).execute();

		const writes: Compilable[] = [
			this.db
				.updateTable('users')
				.set({ ...toColumns(changes), username: newUsername })
				.where('id', '=', userId),
			this.db.updateTable('bans').set({ username: newUsername }).where('username', '=', oldUsername),
			this.db.updateTable('posts').set({ poster: newUsername }).where('poster_id', '=', userId),
			this.db.updateTable('posts').set({ edited_by: newUsername }).where('edited_by', '=', oldUsername),
			this.db.updateTable('topics').set({ poster: newUsername }).where('poster', '=', oldUsername),
			this.db.updateTable('topics').set({ last_poster: newUsername }).where('last_poster', '=', oldUsername),
			this.db.updateTable('forums').set({ last_poster: newUsername }).where('last_poster', '=', oldUsername),
			this.db.updateTable('online').set({ ident: newUsername }).where('ident', '=', oldUsername),
			// plugins/apms/profile_add6.php. Écart : les destinataires sont remplacés élément par élément
			// (le REPLACE() du PHP renommait aussi « MaxDUO » en renommant « Max »).
			this.db.updateTable('messages').set({ sender: newUsername }).where('sender', '=', oldUsername),
			this.db.updateTable('messages').set({ last_poster: newUsername }).where('last_poster', '=', oldUsername),
		];
		for (const message of received) {
			const receiver = renameInList(message.receiver, oldUsername, newUsername);
			if (receiver !== message.receiver) writes.push(this.db.updateTable('messages').set({ receiver }).where('id', '=', message.id));
		}
		// Listes de modérateurs des forums (nom → id, triées par nom).
		for (const forum of forums) {
			const moderators = parseModerators(forum.moderators);
			if (![...moderators.values()].includes(userId)) continue;
			moderators.delete(oldUsername);
			moderators.set(newUsername, userId);
			const sorted = new Map([...moderators].sort(([a], [b]) => caseInsensitive(a, b)));
			writes.push(
				this.db
					.updateTable('forums')
					.set({ moderators: serializeModerators(sorted) })
					.where('id', '=', forum.id),
			);
		}

		const results = await this.db.batch(writes);
		return { bansUpdated: Number(results[1]?.numAffectedRows ?? 0) > 0 };
	}

	async findSimilarUsername(username: string, skeleton: string, excludeUserId: number): Promise<string | null> {
		const row = await this.db
			.selectFrom('users')
			.select('username')
			.where((eb) =>
				eb.or([
					eb(eb.fn('upper', ['username']), '=', username.toUpperCase()),
					eb(eb.fn('upper', ['username']), '=', skeleton.toUpperCase()),
				]),
			)
			.where('id', '>', GUEST_USER_ID)
			.where('id', '!=', excludeUserId)
			.executeTakeFirst();
		return row?.username ?? null;
	}

	async listUsernamesByEmail(email: string, excludeUserId: number): Promise<string[]> {
		const rows = await this.db.selectFrom('users').select('username').where('email', '=', email).where('id', '!=', excludeUserId).execute();
		return rows.map((row) => row.username);
	}
}
