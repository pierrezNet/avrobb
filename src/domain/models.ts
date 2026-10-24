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
	/** Les modérateurs de ce groupe peuvent modifier les profils (g_mod_edit_users). */
	canModEditUsers: boolean;
	canReadBoard: boolean;
	canViewUsers: boolean;
	canPostReplies: boolean;
	canEditPosts: boolean;
	canDeletePosts: boolean;
	canDeleteTopics: boolean;
	canSendEmail: boolean;
	canPostTopics: boolean;
	/** Liens autorisés dans les messages (g_post_links) : sinon [url] est refusée. */
	canPostLinks: boolean;
	/** Délai minimal entre deux messages, en secondes (g_post_flood). */
	postFlood: number;
	/** Promotion automatique (g_promote_next_group, 0 = aucune) après g_promote_min_posts messages. */
	promoteNextGroup: number;
	promoteMinPosts: number;
	canSearch: boolean;
	canSearchUsers: boolean;
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
	/** Nombre de sujets par page ; null = valeur par défaut du forum. */
	topicsPerPage: number | null;
	timezone: number;
	dst: boolean;
	showAvatars: boolean;
	showSignatures: boolean;
	/** Date de la visite précédente (users.last_visit), en secondes Unix. */
	lastVisit: number;
	/** Début de la visite en cours (online.logged), recopié dans last_visit à la déconnexion. */
	logged: number;
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
	email: string;
	numPosts: number;
	/** Date de son dernier message (users.last_post, ou online.last_post pour un invité), pour l'anti-flood. */
	lastPost: number | null;
	/** Abonnement coché par défaut aux sujets où il écrit (users.auto_notify). */
	autoNotify: boolean;
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
	/** Le lecteur suit ce sujet (topic_subscriptions) ; toujours faux pour un invité. */
	isSubscribed: boolean;
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
	defaultTopicsPerPage: number;
	/** « Le point » devant les sujets où le membre a écrit (o_show_dot). */
	showDot: boolean;
	forumSubscriptions: boolean;
	topicSubscriptions: boolean;
	/** Compteur de vues des sujets (o_topic_views). */
	topicViews: boolean;
	/** Règles du forum (o_rules_message), HTML saisi par l'administrateur. */
	rulesMessage: string;
	/** Recherche dans plusieurs forums (o_search_all_forums) ; sinon un seul forum à choisir. */
	searchAllForums: boolean;
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
	/** Message du mode maintenance (o_maintenance_message), HTML saisi par l'administrateur. */
	maintenanceMessage: string;
	/** Durée d'une visite (o_timeout_visit) et délai d'inactivité de la liste des présents (o_timeout_online), en secondes. */
	timeoutVisit: number;
	timeoutOnline: number;
	adminEmail: string;
	/** Expéditeur des e-mails automatiques (o_webmaster_email). */
	webmasterEmail: string;
	smtp: { host: string; user: string; pass: string; ssl: boolean };
	/** Groupe des nouveaux membres (o_default_user_group). */
	defaultUserGroup: number;
	registration: {
		/** o_regs_verify : mot de passe envoyé par e-mail, compte à valider à la première connexion. */
		verify: boolean;
		/** o_regs_report : prévenir la liste d'administration (o_mailing_list) de chaque inscription. */
		report: boolean;
		mailingList: string;
		allowBannedEmail: boolean;
		allowDupeEmail: boolean;
		defaultEmailSetting: number;
		defaultTimezone: number;
		defaultDst: boolean;
		defaultLang: string;
	};
	/** Rédaction des messages (post.php, edit.php). */
	posting: {
		/** o_topic_review : derniers messages rappelés sous le formulaire de réponse (0 = aucun). */
		topicReview: number;
		/** o_quote_depth : profondeur maximale des citations imbriquées. */
		quoteDepth: number;
		/** o_make_links : adresses « www. » transformées en liens. */
		makeLinks: boolean;
		/** p_subject_all_caps et p_message_all_caps : sujet ou message tout en capitales autorisé. */
		subjectAllCaps: boolean;
		messageAllCaps: boolean;
		/** p_force_guest_email : adresse e-mail obligatoire pour un invité. */
		forceGuestEmail: boolean;
		/** o_quickpost : formulaire de réponse rapide sous la discussion. */
		quickpost: boolean;
	};
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
	/** Liste des membres en ligne en bas de l'index (o_users_online). */
	usersOnline: boolean;
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

/** Dernier message d'un forum ou d'un sujet (forums.last_post*, topics.last_post*). */
export interface LastPost {
	postedAt: number;
	postId: number;
	poster: string;
}

/** Forum tel qu'affiché dans la liste de l'index. */
export interface ForumSummary {
	id: number;
	name: string;
	/** forums.forum_desc : HTML saisi par l'administrateur, affiché tel quel comme en PHP. */
	descriptionHtml: string;
	/** Forum de redirection : URL de destination, sinon null. */
	redirectUrl: string | null;
	moderators: ReadonlyMap<string, number>;
	numTopics: number;
	numPosts: number;
	lastPost: LastPost | null;
}

export interface IndexCategory {
	id: number;
	name: string;
	forums: ForumSummary[];
}

/** Sujet modifié depuis une date (pour l'indicateur de nouveaux messages). */
export interface RecentTopic {
	forumId: number;
	topicId: number;
	lastPost: number;
}

/** cache_users_info.php : nombre de membres et dernier inscrit. */
export interface UsersInfo {
	totalUsers: number;
	newestUser: { id: number; username: string } | null;
}

/** Ligne de la table online (membre ou invité actif). */
export interface OnlineVisitor {
	userId: number;
	ident: string;
}

/** Ordre des sujets d'un forum (forums.sort_by). */
export type TopicSort = 'lastPost' | 'posted' | 'subject';

/** Forum consulté (viewforum). */
export interface ForumInfo {
	id: number;
	name: string;
	redirectUrl: string | null;
	moderators: ReadonlyMap<string, number>;
	numTopics: number;
	sortBy: TopicSort;
	/** Permission « nouvelle discussion » propre au forum pour le groupe ; null = celle du groupe. */
	topicPermission: boolean | null;
	/** Le membre suit ce forum (forum_subscriptions). */
	isSubscribed: boolean;
}

/** Sujet dans la liste d'un forum. */
export interface TopicSummary {
	id: number;
	poster: string;
	subject: string;
	posted: number;
	lastPost: LastPost | null;
	numViews: number;
	numReplies: number;
	closed: boolean;
	sticky: boolean;
	/** Sujet déplacé : id du sujet de destination, sinon null. */
	movedTo: number | null;
	/** Le membre a écrit dans ce sujet (« le point ») ; toujours faux si o_show_dot est désactivé. */
	hasPosted: boolean;
}

/** Membre dans la liste des membres (userlist.php). */
export interface MemberSummary {
	id: number;
	username: string;
	title: string;
	numPosts: number;
	registered: number;
	groupId: number;
	groupUserTitle: string;
}

export interface GroupSummary {
	id: number;
	title: string;
}

export type MemberSort = 'username' | 'registered' | 'num_posts';

export interface MemberFilter {
	/** Motif de pseudo, « * » jouant le rôle du joker ; null pour tous. */
	username: string | null;
	groupId: number | null;
}

/** Profil public d'un membre (branche « consultation » de profile.php). */
export interface UserProfile {
	id: number;
	username: string;
	email: string;
	emailSetting: number;
	title: string;
	realname: string;
	url: string;
	location: string;
	/** Messageries instantanées : Jabber, ICQ, MSN, AOL IM, Yahoo. */
	jabber: string;
	icq: string;
	msn: string;
	aim: string;
	yahoo: string;
	signature: string;
	/** Biographie (plugile UP_Ma_biographie, propre à PV) ; vide si non rédigée. */
	biography: string;
	numPosts: number;
	lastPost: number | null;
	registered: number;
	groupId: number;
	groupUserTitle: string;
	groupIsModerator: boolean;
	acceptsPrivateMessages: boolean;
}

/** Sujet trouvé par une recherche (affichage « discussions »). */
export interface SearchTopic extends TopicSummary {
	forumId: number;
	forumName: string;
}

/** Message trouvé par une recherche (affichage « messages »). */
export interface SearchPost {
	id: number;
	poster: string;
	posterId: number;
	posted: number;
	message: string;
	hideSmilies: boolean;
	topicId: number;
	subject: string;
	firstPostId: number;
	topicLastPost: number;
	numReplies: number;
	forumId: number;
	forumName: string;
}

/** Image de la galerie de PV. */
export interface GalleryImage {
	id: number;
	title: string;
	username: string;
	description: string;
	/** Horodatage d'envoi, qui sert aussi de nom de fichier. */
	addedAt: number;
	/** Extension du fichier, « .jpg » ou « .gif ». */
	extension: '.jpg' | '.gif';
}

/** Où l'on écrit (post.php) : forum, permissions du groupe, et sujet s'il s'agit d'une réponse. */
export interface PostingTarget {
	forum: { id: number; name: string; moderators: ReadonlyMap<string, number>; isRedirect: boolean };
	/** Permissions propres au forum pour le groupe (forum_perms) ; null = celles du groupe. */
	replyPermission: boolean | null;
	topicPermission: boolean | null;
	topic: { id: number; subject: string; closed: boolean; isSubscribed: boolean } | null;
}

/** Message rappelé sous le formulaire de réponse (o_topic_review). */
export interface ReviewPost {
	poster: string;
	message: string;
	hideSmilies: boolean;
	posted: number;
}

/** Abonné à prévenir d'une nouvelle réponse ou discussion. */
export interface Subscriber {
	email: string;
	/** Notification avec le texte du message (notify_with_post). */
	notifyWithPost: boolean;
}

/** Message à modifier ou supprimer (edit.php, delete.php), avec son sujet et son forum. */
export interface EditablePost {
	id: number;
	poster: string;
	posterId: number;
	/** L'auteur est administrateur : un simple modérateur ne peut pas toucher à son message. */
	posterIsAdmin: boolean;
	message: string;
	hideSmilies: boolean;
	posted: number;
	topic: { id: number; subject: string; sticky: boolean; closed: boolean; firstPostId: number };
	forum: { id: number; name: string; moderators: ReadonlyMap<string, number> };
}

/** Brouillon de PV : nouvelle discussion (topicId null, sujet propre) ou réponse à un sujet. */
export interface Draft {
	id: number;
	posterId: number;
	/** Sujet du brouillon, ou celui de la discussion pour une réponse. */
	subject: string;
	message: string;
	posted: number;
	topicId: number | null;
	forum: { id: number; name: string };
}
