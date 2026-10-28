/**
 * Textes communs à toutes les pages : en-tête, pied, messages d'erreur, titres des membres.
 * Source : lang/French/common.php de Pilote-Virtuel. Les espaces insécables (&#160;) y sont
 * écrits « \u00a0 », et les chaînes à trous (%s) deviennent des fonctions.
 */

export const common = {
	langCode: 'fr',

	// Avis
	badRequest: 'Erreur. Le lien que vous avez suivi est incorrect ou périmé.',
	noView: "Vous n'êtes pas autorisé(e) à visiter ces forums.",
	badCsrf: "Mauvais hachage CSRF. Vous avez été renvoyé vers cette page à partir d'une source non autorisée.",
	noPermission: "Vous n'êtes pas autorisé(e) à afficher cette page.",
	/** Absent de FluxBB : remplace la page d'erreur technique de error(). */
	serverError: 'Une erreur est survenue. Veuillez réessayer dans quelques instants.',

	// Bannissement (check_bans())
	banMessage: 'Vous êtes banni(e) de ce forum.',
	banExpires: (date: string) => `Votre bannissement expire le ${date}.`,
	banReason: "L'administrateur ou le modérateur qui vous a banni envoie le message suivant\u00a0:",
	banContact: "Pour toute question, contactez l'administrateur",
	// Pied de page : pages d'information (AvroBB)
	footerNav: 'Informations',
	footerTerms: 'Termes et règles',
	footerPrivacy: 'Politique de confidentialité',
	footerHelp: 'Aide',
	footerStats: 'Statistiques',
	/** Pastille du menu (MP) : nombre suivi de ce texte pour les lecteurs d'écran. */
	unreadCount: 'non lus',
	banReadOnly: 'Vous êtes banni(e) : vous pouvez lire le forum, mais plus y écrire.',
	banWriteRefused: 'Vous êtes banni(e) : vous pouvez lire le forum, mais plus y écrire. Cette action vous est refusée.',

	// Divers
	announcement: 'Annonce',
	info: 'Info',
	goBack: 'Retour',
	/** Absent de FluxBB : message() renvoie en arrière en JavaScript, ici un vrai lien. */
	backToIndex: "Retour à l'accueil",
	maintenance: 'Maintenance',
	previous: 'Précédent',
	next: 'Suivant',
	spacer: '…',
	pages: 'Pages',
	page: (n: number) => `Page ${n}`,

	// BBCode (include/parser.php)
	wrote: (author: string) => `${author} a écrit\u00a0:`,
	imageLink: 'image',
	/** Absents de FluxBB : libellés du spoiler (mod Spoiler) et du lecteur vidéo intégré. */
	spoiler: 'Spoiler',
	video: 'Vidéo',

	// Titres
	member: 'Membre',
	moderator: 'Modérateur',
	administrator: 'Administrateur',
	banned: 'En vacances',
	guest: 'Invité',

	// Navigation (haut de chaque page)
	skipToContent: 'Aller au contenu',
	menu: 'Menu',
	mainNav: 'Navigation principale',
	breadcrumbs: "Fil d'Ariane",
	index: 'Accueil',
	userList: 'Liste des membres',
	/** Ajouts au menu de PV. */
	gallery: 'Galerie',
	drafts: 'Brouillons',
	rules: 'Règles',
	search: 'Recherche',
	register: 'Inscription',
	login: 'Identification',
	notLoggedIn: "Vous n'êtes pas identifié(e).",
	profile: 'Profil',
	logout: 'Déconnexion',
	loggedInAs: "Connecté(e) sous l'identité\u00a0",
	admin: 'Administration',
	lastVisit: (date: string) => `Dernière visite\u00a0: ${date}`,
	topicSearches: 'Contributions\u00a0:',
	newPostsHeader: 'Nouvelles',
	activeTopics: 'Récentes',
	unansweredTopics: 'Sans réponse',
	postedTopics: 'Personnelles',
	showNewPosts: 'Trouver les discussions avec de nouveaux messages depuis votre dernière visite.',
	showActiveTopics: 'Trouver les discussions comportant des messages récents.',
	showUnansweredTopics: 'Trouver les discussions sans réponse.',
	showPostedTopics: 'Trouver les discussions auxquelles vous avez participé.',
	titleSeparator: ' / ',

	// Pied de page
	boardFooter: 'Pied de page des forums',
	/** « Mod controls » de lang/French/topic.php et forum.php. */
	modControls: 'Modération',
	moderateTopic: 'Modérer la discussion',
	moveTopic: 'Déplacer la discussion',
	openTopic: 'Ouvrir la discussion',
	closeTopic: 'Fermer la discussion',
	unstickTopic: 'Détacher la discussion',
	stickTopic: 'Épingler la discussion',
	moderateForum: 'Modérer le forum',
	/** Balises de PV du pied de viewtopic (footer.php). */
	addLabel: (label: string) => `Ajouter ${label}`,
	removeLabel: (label: string) => `Supprimer ${label}`,
	poweredBy: 'Créé par',

	// Flux (extern.php)
	rssForumFeed: 'Flux RSS du forum',
	rssTopicFeed: 'Flux RSS de la discussion',

	rssDescription: (board: string) => `Les sujets les plus récents sur ${board}.`,
	rssDescriptionTopic: (topic: string) => `Les sujets les plus récents dans ${topic}.`,
	rssReply: 'Réponse à\u00a0:  ',

	// Liens d'administration de l'en-tête
	newReports: 'De nouveaux signalements ont été envoyés\u00a0!',
	maintenanceModeEnabled: 'Le mode maintenance est activé\u00a0!',

	/** Absent de FluxBB : liste du complètement des noms de membres (@mention, destinataires). */
	memberSuggestions: 'Membres correspondants',
};
