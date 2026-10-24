/**
 * Objets du domaine, indépendants de la base (colonnes 0/1 converties en booléens, noms explicites).
 */

/** Identifiants réservés de FluxBB (PUN_ADMIN, PUN_GUEST…). */
export const GroupId = {
	Admin: 1,
	Moderator: 2,
	Guest: 3,
	Member: 4,
} as const;

export const GUEST_USER_ID = 1;

export interface Group {
	id: number;
	title: string;
	userTitle: string;
	isModerator: boolean;
	canModPromoteUsers: boolean;
	canReadBoard: boolean;
	canViewUsers: boolean;
	canPostReplies: boolean;
	canEditPosts: boolean;
	canDeletePosts: boolean;
	canDeleteTopics: boolean;
	canSendEmail: boolean;
}

/** Utilisateur qui consulte la page (invité ou membre connecté). */
export interface Viewer {
	id: number;
	username: string;
	isGuest: boolean;
	group: Group;
	/** Nombre de messages par page ; null = valeur par défaut du forum. */
	postsPerPage: number | null;
	timezone: number;
	dst: boolean;
	showAvatars: boolean;
	showSignatures: boolean;
}

export interface Forum {
	id: number;
	name: string;
	/** Modérateurs du forum : nom d'utilisateur → id. */
	moderators: ReadonlyMap<string, number>;
}

export interface Topic {
	id: number;
	subject: string;
	closed: boolean;
	sticky: boolean;
	firstPostId: number;
	numReplies: number;
	forum: Forum;
	/** Permission « répondre » propre au forum pour le groupe ; null = celle du groupe. */
	forumReplyPermission: boolean | null;
}

/** Auteur inscrit d'un message (absent pour un invité ou un compte supprimé). */
export interface PostAuthor {
	id: number;
	email: string;
	title: string;
	url: string;
	location: string;
	signature: string;
	emailSetting: number;
	numPosts: number;
	registered: number;
	adminNote: string;
	groupId: number;
	groupUserTitle: string;
	isOnline: boolean;
}

export interface Post {
	id: number;
	username: string;
	posterIp: string;
	posterEmail: string;
	message: string;
	hideSmilies: boolean;
	posted: number;
	edited: number | null;
	editedBy: string;
	author: PostAuthor | null;
}

/** Réglages du forum (table config) utiles à l'affichage. */
export interface BoardConfig {
	boardTitle: string;
	defaultPostsPerPage: number;
	dateFormat: string;
	timeFormat: string;
	showUserInfo: boolean;
	showPostCount: boolean;
	signatures: boolean;
	avatars: boolean;
	avatarsDir: string;
	bbcode: boolean;
	imgTag: boolean;
}
