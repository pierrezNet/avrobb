/**
 * Tables FluxBB 1.5 utilisées par l'application (noms sans préfixe, voir TablePrefixPlugin).
 * Seules les colonnes lues sont déclarées ; le schéma reste celui de la base existante.
 */

import type { Generated } from 'kysely';

export interface ConfigTable {
	conf_name: string;
	conf_value: string | null;
}

export interface ForumsTable {
	id: Generated<number>;
	forum_name: string;
	moderators: string | null;
	cat_id: number;
}

export interface ForumPermsTable {
	group_id: number;
	forum_id: number;
	read_forum: number;
	post_replies: number;
	post_topics: number;
}

export interface GroupsTable {
	g_id: Generated<number>;
	g_title: string;
	g_user_title: string | null;
	g_moderator: number;
	g_mod_promote_users: number;
	g_read_board: number;
	g_view_users: number;
	g_post_replies: number;
	g_edit_posts: number;
	g_delete_posts: number;
	g_delete_topics: number;
	g_send_email: number;
}

export interface OnlineTable {
	user_id: number;
	idle: number;
}

export interface PostsTable {
	id: Generated<number>;
	poster: string;
	poster_id: number;
	poster_ip: string | null;
	poster_email: string | null;
	message: string | null;
	hide_smilies: number;
	posted: number;
	edited: number | null;
	edited_by: string | null;
	topic_id: number;
}

export interface TopicsTable {
	id: Generated<number>;
	subject: string;
	posted: number;
	first_post_id: number;
	num_replies: number;
	closed: number;
	sticky: number;
	moved_to: number | null;
	forum_id: number;
}

export interface UsersTable {
	id: Generated<number>;
	group_id: number;
	username: string;
	password: string;
	email: string;
	title: string | null;
	url: string | null;
	location: string | null;
	signature: string | null;
	disp_posts: number | null;
	email_setting: number;
	show_avatars: number;
	show_sig: number;
	timezone: number;
	dst: number;
	num_posts: number;
	registered: number;
	admin_note: string | null;
}

export interface Database {
	config: ConfigTable;
	forums: ForumsTable;
	forum_perms: ForumPermsTable;
	groups: GroupsTable;
	online: OnlineTable;
	posts: PostsTable;
	topics: TopicsTable;
	users: UsersTable;
}

export const TABLE_NAMES: readonly (keyof Database)[] = ['config', 'forums', 'forum_perms', 'groups', 'online', 'posts', 'topics', 'users'];
