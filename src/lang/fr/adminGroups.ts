/**
 * Textes d'admin_groups.php (lang/French/admin_groups.php).
 */

export const adminGroups = {
	title: "Groupes d'utilisateurs",
	missingTitle: 'Vous devez indiquer un nom au groupe.',
	cannotRemoveDefault:
		"Le groupe par défaut ne peut être supprimé. Pour pouvoir supprimer ce groupe, vous devez d'abord configurer un autre groupe.",
	addGroupsHead: 'Ajouter/configurer des groupes',
	addGroupSubhead: 'Ajouter un nouveau groupe',
	newGroupLabel: 'Baser le nouveau groupe sur',
	newGroupHelp:
		"Sélectionner un groupe d'utilisateurs duquel le nouveau groupe va hériter les permissions. La page suivante vous permettra de régler plus précisément les paramètres.",
	defaultGroupSubhead: 'Définir le groupe par défaut',
	defaultGroupLabel: 'Groupe par défaut',
	defaultGroupHelp:
		"Ceci est le groupe par défaut, c'est-à-dire le groupe dans lequel sont placés les utilisateurs lorsqu'ils s'inscrivent. Pour des raisons de sécurité, les utilisateurs ne peuvent être placés ni dans le groupe des modérateurs, ni dans le groupe des administrateurs par défaut.",
	existingGroupsHead: 'Groupes existants',
	editGroupsInfo:
		'Les groupes prédéfinis des invités, administrateurs, modérateurs et membres ne peuvent être supprimés. Cependant, ils peuvent être modifiés. Veuillez prendre note que, dans certains groupes, certaines options ne sont pas disponibles (ex. : la permission de modifier les messages pour les invités). Les administrateurs ont toujours toutes les permissions.',
	edit: 'Modifier',
	delete: 'Supprimer',
	groupDeleteHead: 'Suppression de groupe',
	confirmDeleteSubhead: 'Confirmez la suppression du groupe',
	confirmDeleteWarn: "ATTENTION ! Après avoir supprimé un groupe il n'est plus possible de le rétablir.",
	moveUsersSubhead: 'Déplacer les utilisateurs actuellement dans le groupe',
	moveUsersLabel: 'Déplacer les utilisateurs vers',
	deleteGroup: 'Supprimer le groupe',
	groupSettingsHead: 'Paramètres du groupe',
	groupSettingsInfo:
		"Les options et permissions ci-dessous sont les permissions par défaut de ce groupe d'utilisateurs. Ces options sont appliquées si aucune permission spécifique au forum n'est effective.",
	groupTitleLabel: 'Nom du groupe',
	userTitleLabel: "Titre d'utilisateur",
	disablePromotion: 'Désactiver la promotion automatique',
	promoteMinPostsLabel: 'Promouvoir les utilisateurs.',
	moderatorInfo:
		"Veuillez prendre note que pour qu'un utilisateur de ce groupe puisse obtenir des privilèges de modérateur, il doit être assigné à modérer un ou plusieurs forums. Ceci se fait via la page d'administration d'utilisateur du profil de l'utilisateur.",
	titleExists: (title: string) => `Il existe déjà un groupe nommé «\u00a0${title}\u00a0».`,
	confirmDeleteInfo: (title: string) => `Souhaitez-vous vraiment supprimer le groupe «\u00a0${title}\u00a0» ?`,
	moveUsersInfo: (title: string, count: number) =>
		`Le groupe «\u00a0${title}\u00a0» comporte actuellement ${count} membre(s). Veuillez choisir un groupe auquel ses membres seront assignés après la suppression.`,
	userTitleHelp:
		'Ce titre remplacera tout titre que les utilisateurs auraient obtenu dans ce groupe. Laissez vide pour utiliser le titre par défaut.',
	promoteMinPosts: 'Nombre de messages pour la promotion',
	added: 'Groupe ajouté.',
	edited: 'Groupe modifié.',
	removed: 'Groupe supprimé.',
	defaultSet: 'Groupe par défaut défini.',
	add: 'Ajouter',
	save: 'Enregistrer',
	setDefault: 'Enregistrer',
	yes: 'Oui',
	no: 'Non',
	goBack: 'Retour',
	fields: {
		g_promote_next_group: {
			label: 'Promouvoir les utilisateurs.',
			help: 'Vous pouvez promouvoir des utilisateurs dans un nouveau groupe automatiquement après un certain nombre de messages. Sélectionnez « Désactiver la promotion automatique » pour désactiver. Pour des raisons de sécurité, vous n\'êtes pas autorisé à sélectionner un groupe "administrateur". Les changements de groupe pour les utilisateurs touchés par ce paramètre prendra effet immédiatement. Notez que le nombre de messages que vous entrez est le nombre total des messages d\'un utilisateur, pas le nombre de messages faits en tant que membre de ce groupe.',
		},
		g_moderator: {
			label: 'Appliquer des privilèges de modérateur aux utilisateurs',
			help: "Pour qu'un utilisateur de ce groupe puisse obtenir des privilèges de modérateur, il doit être assigné à modérer un ou plusieurs forums. Ceci se fait via la page d'administration d'utilisateur du profil de l'utilisateur.",
		},
		g_mod_edit_users: {
			label: 'Autoriser les modérateurs à éditer les profils des utilisateurs',
			help: 'Si les privilèges de modérateurs sont activés, autoriser les utilisateurs de ce groupe à éditer les profils des utilisateurs.',
		},
		g_mod_rename_users: {
			label: 'Autoriser les modérateurs à renommer les utilisateurs',
			help: 'Si les privilèges de modérateurs sont activés, autoriser les utilisateurs de ce groupe à renommer les utilisateurs.',
		},
		g_mod_change_passwords: {
			label: 'Autoriser les modérateurs à modifier les mots de passe',
			help: 'Si les privilèges de modérateurs sont activés, autoriser les utilisateurs de ce groupe à modifier le mot de passe des utilisateurs.',
		},
		g_mod_ban_users: {
			label: 'Autoriser les modérateurs à bannir les utilisateurs',
			help: 'Si les privilèges de modérateurs sont activés, autoriser les utilisateurs de ce groupe à bannir les utilisateurs.',
		},
		g_read_board: {
			label: 'Lire le forum',
			help: "Autoriser les utilisateurs de ce groupe à afficher le forum. Ce paramètre s'applique à tous les aspects du forum et ne peut donc pas être remplacé par les paramètres spécifiques au forum. Si votre choix porte sur le « Non », les utilisateurs dans ce groupe ne pourront que se connecter/déconnecter et s'inscrire.",
		},
		g_view_users: {
			label: "Afficher les informations sur l'utilisateur",
			help: 'Autoriser les utilisateurs à afficher la liste des utilisateurs et les profils.',
		},
		g_post_replies: { label: 'Répondre aux messages', help: 'Autoriser les utilisateurs de ce groupe à répondre dans les discussions.' },
		g_post_topics: { label: 'Créer des discussions', help: 'Autoriser les utilisateurs de ce groupe à créer des discussions.' },
		g_edit_posts: { label: 'Modifier les messages', help: 'Autoriser les utilisateurs de ce groupe à modifier leurs propres messages.' },
		g_delete_posts: {
			label: 'Supprimer les messages',
			help: 'Autoriser les utilisateurs de ce groupe à supprimer leurs propres messages.',
		},
		g_delete_topics: {
			label: 'Supprimer les discussions',
			help: 'Autoriser les utilisateurs de ce groupe à supprimer leurs propres discussions (ainsi que les éventuelles réponses).',
		},
		g_post_links: {
			label: 'Poster des liens',
			help: "Autoriser les utilisateurs de ce groupe à inclure des liens dans leurs messages. Ce paramètre s'applique également aux signatures et au champ site Web du profil utilisateurs",
		},
		g_set_title: {
			label: "Définir leur propre titre d'utilisateur",
			help: "Autoriser les utilisateurs de ce groupe à définir leur propre titre d'utilisateur.",
		},
		g_search: { label: 'Utiliser la recherche', help: 'Autoriser les utilisateurs de ce groupe à utiliser la fonction de recherche.' },
		g_search_users: {
			label: 'Rechercher dans la liste des utilisateurs',
			help: "Autoriser les utilisateurs de ce groupe à rechercher à partir d'un texte libre des utilisateurs dans la liste d'utilisateurs.",
		},
		g_send_email: {
			label: 'Envoyer des e-mails',
			help: "Autoriser les utilisateurs de ce groupe à envoyer des e-mails à d'autres utilisateurs.",
		},
		g_post_flood: {
			label: 'Intervalle entre messages consécutifs',
			help: 'Délai en secondes à respecter par les utilisateurs de ce groupe entre deux messages envoyés. Définir à 0 pour désactiver.',
		},
		g_search_flood: {
			label: 'Intervalle entre recherches consécutives',
			help: 'Délai en secondes à respecter par les utilisateurs de ce groupe entre deux recherches. Définir à 0 pour désactiver.',
		},
		g_email_flood: {
			label: 'Intervalle entre e-mails consécutifs',
			help: 'Délai en secondes à respecter par les utilisateurs de ce groupe entre deux e-mails envoyés. Définir à 0 pour désactiver.',
		},
		g_report_flood: {
			label: 'Intervalle entre signalements consécutifs',
			help: 'Délai en secondes à respecter par les utilisateurs de ce groupe entre deux signalements envoyés. Définir à 0 pour désactiver.',
		},
		g_promote_min_posts: { label: 'Nombre de messages pour la promotion', help: null },
	} as Record<string, { label: string; help: string | null }>,
};
