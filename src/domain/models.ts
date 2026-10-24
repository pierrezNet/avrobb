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
	canSearch: boolean;
	/** Messagerie privée autorisée au groupe (g_pm, mod APMS). */
	canUsePrivateMessages: boolean;
	/** Nombre maximal de MP conservés (g_pm_limit) ; 0 = illimité. */
	privateMessageLimit: number;
	/** Renommée (mod Reputation) accessible au groupe (g_rep_enable). */
	canUseReputation: boolean;
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
	/** Date de la visite précédente (users.last_visit), en secondes Unix. */
	lastVisit: number;
	/** Thème choisi (users.style), à valider avant usage : voir services/themes.ts. */
	style: string;
	/** Le membre a activé la messagerie privée (users.use_pm). */
	usesPrivateMessages: boolean;
	/** MP conservés dans ses boîtes (users.num_pms). */
	privateMessageCount: number;
	/** Préférences d'affichage : émoticônes, images des messages, images des signatures. */
	showSmilies: boolean;
	showImages: boolean;
	showSignatureImages: boolean;
	/** Le membre participe à la renommée (users.reputation_enable). */
	reputationEnabled: boolean;
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
	/** Messagerie privée activée par le membre (use_pm) et autorisée à son groupe (g_pm). */
	acceptsPrivateMessages: boolean;
	/** Renommée : votes positifs et négatifs reçus, et participation du membre. */
	reputationPlus: number;
	reputationMinus: number;
	reputationEnabled: boolean;
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

/** Format des liens de flux de syndication (o_feed_type). */
export type FeedType = 'none' | 'rss' | 'atom';

/** Réglages du forum (table config) utiles à l'affichage. */
export interface BoardConfig {
	boardTitle: string;
	defaultStyle: string;
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
	/** Lien « Règles » dans le menu (o_rules). */
	rules: boolean;
	registrationsAllowed: boolean;
	/** Liens de menu supplémentaires, en HTML saisi par l'administrateur (o_additional_navlinks). */
	additionalNavlinks: string;
	/** Signalements reçus dans le forum (o_report_method 0 ou 2) ou seulement par e-mail. */
	reportsByBoard: boolean;
	maintenance: boolean;
	/** Annonce affichée en haut de chaque page ; null si désactivée (HTML saisi par l'administrateur). */
	announcement: string | null;
	quickjump: boolean;
	feedType: FeedType;
	/** Version de FluxBB affichée dans « Propulsé par » ; null si o_show_version est désactivé. */
	shownVersion: string | null;
	privateMessagesEnabled: boolean;
	/** Émoticônes dans les messages (o_smilies) et dans les signatures (o_smilies_sig). */
	smilies: boolean;
	signatureSmilies: boolean;
	censoring: boolean;
	/** BBCode et balise [img] dans les signatures (p_sig_bbcode, p_sig_img_tag). */
	signatureBbcode: boolean;
	signatureImgTag: boolean;
	/** o_base_url, sans « / » final. */
	baseUrl: string;
	/** o_indent_num_spaces : espaces remplaçant une tabulation hors [code]. */
	indentSpaces: number;
	reputationEnabled: boolean;
}

/** Balise de sujet de PV (« [Réglé] »…), posée par les modérateurs. */
export interface TopicLabel {
	id: number;
	name: string;
	/** Forme du préfixe : [nom], *nom* ou #nom# (balises.baltype). */
	style: 'brackets' | 'stars' | 'hashes';
	color: string;
	bold: boolean;
	italic: boolean;
	underline: boolean;
}

/** Forum proposé dans la liste « Atteindre » du pied de page. */
export interface ForumLink {
	id: number;
	name: string;
	/** Forum de redirection (forums.redirect_url) : FluxBB ajoute « >>> » au nom. */
	isRedirect: boolean;
}

export interface ForumCategory {
	id: number;
	name: string;
	forums: ForumLink[];
}
