import type { Db } from '../db/database.ts';
import { GUEST_USER_ID, type Group, type Viewer } from '../domain/models.ts';

/** Viewer accompagné du hash de mot de passe, nécessaire à la vérification du cookie. */
export interface ViewerRecord {
	viewer: Viewer;
	passwordHash: string;
}

export interface UserReader {
	findViewer(userId: number): Promise<ViewerRecord | null>;
}

export class UserRepository implements UserReader {
	constructor(private readonly db: Db) {}

	async findViewer(userId: number): Promise<ViewerRecord | null> {
		const row = await this.db
			.selectFrom('users as u')
			.innerJoin('groups as g', 'g.g_id', 'u.group_id')
			.select([
				'u.id', 'u.username', 'u.password', 'u.disp_posts', 'u.timezone', 'u.dst',
				'u.show_avatars', 'u.show_sig',
				'g.g_id', 'g.g_title', 'g.g_user_title', 'g.g_moderator', 'g.g_mod_promote_users',
				'g.g_read_board', 'g.g_view_users', 'g.g_post_replies', 'g.g_edit_posts',
				'g.g_delete_posts', 'g.g_delete_topics', 'g.g_send_email',
			])
			.where('u.id', '=', userId)
			.executeTakeFirst();

		if (row === undefined)
			return null;

		const group: Group = {
			id: row.g_id,
			title: row.g_title,
			userTitle: row.g_user_title ?? '',
			isModerator: row.g_moderator === 1,
			canModPromoteUsers: row.g_mod_promote_users === 1,
			canReadBoard: row.g_read_board === 1,
			canViewUsers: row.g_view_users === 1,
			canPostReplies: row.g_post_replies === 1,
			canEditPosts: row.g_edit_posts === 1,
			canDeletePosts: row.g_delete_posts === 1,
			canDeleteTopics: row.g_delete_topics === 1,
			canSendEmail: row.g_send_email === 1,
		};

		return {
			passwordHash: row.password,
			viewer: {
				id: row.id,
				username: row.username,
				isGuest: row.id === GUEST_USER_ID,
				group,
				postsPerPage: row.disp_posts,
				timezone: row.timezone,
				dst: row.dst === 1,
				showAvatars: row.show_avatars === 1,
				showSignatures: row.show_sig === 1,
			},
		};
	}
}
