/**
 * Tables FluxBB 1.5 utilisées par l'application (noms sans préfixe, voir TablePrefixPlugin).
 * Seules les colonnes lues sont déclarées ; le schéma reste celui de la base existante.
 */

import type { Generated } from 'kysely';

/** Balises de sujet de PV (mod PunBalise : « [Réglé] », « [En cours] »…). */
export interface BalisesTable {
	id: Generated<number>;
	nom: string;
	couleur: string;
	gras: number;
	ital: number;
	souli: number;
	position: number;
	/** 0 = [nom], 1 = *nom*, 2 = #nom#. */
	baltype: number;
}

/**
 * Balises posées sur les sujets : une ligne par sujet (npost = id du SUJET, en texte) et une colonne
 * bal<id> (0/1) par balise. Colonnes dynamiques : lues avec selectAll() puis par leur nom.
 */
export interface BalisesModoTable {
	npost: string;
}

export interface BansTable {
	id: Generated<number>;
	username: string | null;
}

export interface CategoriesTable {
	id: Generated<number>;
	cat_name: string;
	disp_position: number;
}

export interface CensoringTable {
	id: Generated<number>;
	search_for: string;
	replace_with: string;
}

export interface ConfigTable {
	conf_name: string;
	conf_value: string | null;
}

export interface ForumsTable {
	id: Generated<number>;
	forum_name: string;
	forum_desc: string | null;
	redirect_url: string | null;
	num_topics: number;
	num_posts: number;
	last_post: number | null;
	last_post_id: number | null;
	last_poster: string | null;
	moderators: string | null;
	disp_position: number;
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
	g_search: number;
	g_pm: number;
	g_pm_limit: number;
	g_rep_enable: number;
}

/** Messagerie privée (mod APMS) : une ligne par exemplaire d'un message, `owner` étant son détenteur. */
export interface MessagesTable {
	id: Generated<number>;
	owner: number;
	showed: number;
	show_message: number;
}

export interface OnlineTable {
	user_id: number;
	ident: string;
	logged: number;
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

export interface ReportsTable {
	id: Generated<number>;
	zapped: number | null;
}

export interface TopicsTable {
	id: Generated<number>;
	subject: string;
	posted: number;
	first_post_id: number;
	num_replies: number;
	closed: number;
	sticky: number;
	last_post: number;
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
	last_visit: number;
	admin_note: string | null;
	style: string;
	use_pm: number;
	num_pms: number;
	show_smilies: number;
	show_img: number;
	show_img_sig: number;
	rep_plus: number;
	rep_minus: number;
	reputation_enable: number;
}

export interface Database {
	balises: BalisesTable;
	balises_modo: BalisesModoTable;
	bans: BansTable;
	categories: CategoriesTable;
	censoring: CensoringTable;
	config: ConfigTable;
	forums: ForumsTable;
	forum_perms: ForumPermsTable;
	groups: GroupsTable;
	messages: MessagesTable;
	online: OnlineTable;
	posts: PostsTable;
	reports: ReportsTable;
	topics: TopicsTable;
	users: UsersTable;
}

export const TABLE_NAMES: readonly (keyof Database)[] = [
	'balises',
	'balises_modo',
	'bans',
	'categories',
	'censoring',
	'config',
	'forums',
	'forum_perms',
	'groups',
	'messages',
	'online',
	'posts',
	'reports',
	'topics',
	'users',
];
