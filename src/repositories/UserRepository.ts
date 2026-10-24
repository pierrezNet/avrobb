/**
 * Membres et invité : chargement de l'utilisateur courant avec les droits de son groupe
 * (l'équivalent de la requête de check_cookie() dans include/functions.php).
 */

import type { Db } from '../db/database.ts';
import {
	type Group,
	GroupId,
	type GroupSummary,
	GUEST_USER_ID,
	type MemberFilter,
	type MemberSort,
	type MemberSummary,
	type UserProfile,
	type Viewer,
} from '../domain/models.ts';

/** Viewer accompagné du hash de mot de passe, nécessaire à la vérification du cookie. */
export interface ViewerRecord {
	viewer: Viewer;
	passwordHash: string;
}

export interface UserReader {
	findViewer(userId: number): Promise<ViewerRecord | null>;
}

export interface MemberListReader {
	countMembers(filter: MemberFilter): Promise<number>;
	listMembers(filter: MemberFilter, sort: MemberSort, direction: 'asc' | 'desc', offset: number, limit: number): Promise<MemberSummary[]>;
	/** Groupes proposés comme filtre (tous sauf les invités). */
	listGroups(): Promise<GroupSummary[]>;
}

export interface ProfileReader {
	findProfile(userId: number): Promise<UserProfile | null>;
}

/** Comptes en attente de validation (PUN_UNVERIFIED) : jamais listés. */
const UNVERIFIED_GROUP = 0;

export class UserRepository implements UserReader, MemberListReader, ProfileReader {
	constructor(private readonly db: Db) {}

	async findViewer(userId: number): Promise<ViewerRecord | null> {
		const row = await this.db
			.selectFrom('users as u')
			.innerJoin('groups as g', 'g.g_id', 'u.group_id')
			.select([
				'u.id',
				'u.username',
				'u.password',
				'u.disp_topics',
				'u.disp_posts',
				'u.timezone',
				'u.dst',
				'u.show_avatars',
				'u.show_sig',
				'u.last_visit',
				'u.style',
				'u.use_pm',
				'u.num_pms',
				'u.show_smilies',
				'u.show_img',
				'u.show_img_sig',
				'u.reputation_enable',
				'g.g_id',
				'g.g_title',
				'g.g_user_title',
				'g.g_moderator',
				'g.g_mod_promote_users',
				'g.g_mod_edit_users',
				'g.g_read_board',
				'g.g_view_users',
				'g.g_post_replies',
				'g.g_edit_posts',
				'g.g_delete_posts',
				'g.g_delete_topics',
				'g.g_send_email',
				'g.g_post_topics',
				'g.g_search',
				'g.g_search_users',
				'g.g_pm',
				'g.g_pm_limit',
				'g.g_rep_enable',
			])
			.where('u.id', '=', userId)
			.executeTakeFirst();

		if (row === undefined) return null;

		const group: Group = {
			id: row.g_id,
			title: row.g_title,
			userTitle: row.g_user_title ?? '',
			isModerator: row.g_moderator === 1,
			canModPromoteUsers: row.g_mod_promote_users === 1,
			canModEditUsers: row.g_mod_edit_users === 1,
			canReadBoard: row.g_read_board === 1,
			canViewUsers: row.g_view_users === 1,
			canPostReplies: row.g_post_replies === 1,
			canEditPosts: row.g_edit_posts === 1,
			canDeletePosts: row.g_delete_posts === 1,
			canDeleteTopics: row.g_delete_topics === 1,
			canSendEmail: row.g_send_email === 1,
			canPostTopics: row.g_post_topics === 1,
			canSearch: row.g_search === 1,
			canSearchUsers: row.g_search_users === 1,
			canUsePrivateMessages: row.g_pm === 1,
			privateMessageLimit: row.g_pm_limit,
			canUseReputation: row.g_rep_enable === 1,
		};

		return {
			passwordHash: row.password,
			viewer: {
				id: row.id,
				username: row.username,
				isGuest: row.id === GUEST_USER_ID,
				group,
				postsPerPage: row.disp_posts,
				topicsPerPage: row.disp_topics,
				timezone: row.timezone,
				dst: row.dst === 1,
				showAvatars: row.show_avatars === 1,
				showSignatures: row.show_sig === 1,
				lastVisit: row.last_visit,
				style: row.style,
				usesPrivateMessages: row.use_pm === 1,
				privateMessageCount: row.num_pms,
				showSmilies: row.show_smilies === 1,
				showImages: row.show_img === 1,
				showSignatureImages: row.show_img_sig === 1,
				reputationEnabled: row.reputation_enable === 1,
			},
		};
	}

	/** Membres listables (ni l'invité, ni les comptes non validés), filtrés comme userlist.php. */
	#members(filter: MemberFilter) {
		let query = this.db.selectFrom('users as u').where('u.id', '>', GUEST_USER_ID).where('u.group_id', '!=', UNVERIFIED_GROUP);
		// LIKE sans échappement de % et _, comme le PHP : « * » est le joker documenté.
		if (filter.username !== null) query = query.where('u.username', 'like', filter.username.replaceAll('*', '%'));
		if (filter.groupId !== null) query = query.where('u.group_id', '=', filter.groupId);
		return query;
	}

	async countMembers(filter: MemberFilter): Promise<number> {
		const row = await this.#members(filter)
			.select((eb) => eb.fn.countAll<number>().as('total'))
			.executeTakeFirstOrThrow();
		return Number(row.total);
	}

	async listMembers(
		filter: MemberFilter,
		sort: MemberSort,
		direction: 'asc' | 'desc',
		offset: number,
		limit: number,
	): Promise<MemberSummary[]> {
		const rows = await this.#members(filter)
			.leftJoin('groups as g', 'g.g_id', 'u.group_id')
			.select(['u.id', 'u.username', 'u.title', 'u.num_posts', 'u.registered', 'u.group_id', 'g.g_user_title'])
			.orderBy(`u.${sort}`, direction)
			.orderBy('u.id', 'asc')
			.limit(limit)
			.offset(offset)
			.execute();

		return rows.map((row) => ({
			id: row.id,
			username: row.username,
			title: row.title ?? '',
			numPosts: row.num_posts,
			registered: row.registered,
			groupId: row.group_id,
			groupUserTitle: row.g_user_title ?? '',
		}));
	}

	async listGroups(): Promise<GroupSummary[]> {
		const rows = await this.db
			.selectFrom('groups')
			.select(['g_id', 'g_title'])
			.where('g_id', '!=', GroupId.Guest)
			.orderBy('g_id')
			.execute();
		return rows.map((row) => ({ id: row.g_id, title: row.g_title }));
	}

	async findProfile(userId: number): Promise<UserProfile | null> {
		const row = await this.db
			.selectFrom('users as u')
			.leftJoin('groups as g', 'g.g_id', 'u.group_id')
			.select([
				'u.id',
				'u.username',
				'u.email',
				'u.email_setting',
				'u.title',
				'u.realname',
				'u.url',
				'u.location',
				'u.jabber',
				'u.icq',
				'u.msn',
				'u.aim',
				'u.yahoo',
				'u.signature',
				'u.biographie',
				'u.num_posts',
				'u.last_post',
				'u.registered',
				'u.use_pm',
				'u.group_id',
				'g.g_user_title',
				'g.g_moderator',
				'g.g_pm',
			])
			.where('u.id', '=', userId)
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
			biography: row.biographie ?? '',
			numPosts: row.num_posts,
			lastPost: row.last_post !== null && row.last_post > 0 ? row.last_post : null,
			registered: row.registered,
			groupId: row.group_id,
			groupUserTitle: row.g_user_title ?? '',
			groupIsModerator: row.g_moderator === 1,
			acceptsPrivateMessages: row.use_pm === 1 && row.g_pm === 1,
		};
	}
}
