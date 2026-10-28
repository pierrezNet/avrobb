/**
 * Textes d'admin_bans.php (lang/French/admin_bans.php).
 */

export const adminBans = {
	title: 'Bannissements',
	noUser:
		"Aucun utilisateur enregistré sous ce nom d'utilisateur. Si vous souhaitez ajouter un bannissement n'étant pas associé à un nom d'utilisateur veuillez laisser le champ du nom d'utilisateur vide.",
	noUserId: 'Aucun utilisateur inscrit avec cet ID.',
	userIsAdmin: (username: string) =>
		`L'utilisateur ${username} est un administrateur et ne peut être banni. Si vous souhaitez bannir un administrateur, vous devez d'abord le destituer de ce rang.`,
	userIsMod: (username: string) =>
		`L'utilisateur ${username} est un modérateur et ne peut être banni. Si vous souhaitez bannir un modérateur, vous devez d'abord le destituer de ce rang.`,
	errors: {
		mustEnter: "Vous devez indiquer, au minimum, soit un nom d'utilisateur, soit une adresse IP, soit une adresse électronique.",
		guest: 'Un visiteur ne peut être banni.',
		invalidIp: "Vous avez indiqué une IP/plage d'IP invalide.",
		invalidEmail:
			"L'adresse électronique (ex. : utilisateur@domaine.com) ou le nom de domaine d'adresse électronique (ex. : domaine.com) que vous avez indiqué est invalide.",
		invalidDate:
			"Vous avez indiqué une date d'expiration invalide. Le format devrait être du type AAAA-MM-JJ et la date doit être ultérieure à la date d'aujourd'hui.",
	},
	invalidSearchDate: "Vous avez indiqué une date d'expiration invalide.",
	added: 'Bannissement ajouté.',
	edited: 'Bannissement modifié.',
	removed: 'Bannissement supprimé.',
	newBanHead: 'Nouveau bannissement',
	username: "Nom d'utilisateur",
	usernameAdvancedHelp:
		"Le nom d'utilisateur à bannir (insensible à la casse). La page suivante vous permettra d'indiquer une IP et un e-mail personnalisés. Si vous ne souhaitez bannir qu'une IP/plage d'IP ou un e-mail, veuillez laisser ce champ vide.",
	usernameHelp: "Le nom d'utilisateur à bannir (insensible à la casse).",
	add: 'Ajouter',
	searchHead: 'Recherche de bannissements',
	searchInfo:
		"Recherche de bannissements dans la base de données. Vous pouvez indiquer un ou plusieurs termes à retrouver. Les jokers sous formes d'astérisques (*) sont acceptés. Pour afficher tous les bannissements, laisser tous les champs vides.",
	dateHelp: '(aaaa-mm-jj)',
	message: 'Message',
	expireAfter: 'Expire après',
	expireBefore: 'Expire avant',
	orderBy: 'Trier par',
	orders: { username: "Nom d'utilisateur", ip: 'IP', email: 'E-mail', expire: "Date d'expiration" } as Record<string, string>,
	direction: 'Ordre',
	ascending: 'Ascendant',
	descending: 'Descendant',
	submitSearch: 'Lancer la recherche',
	email: 'E-mail',
	emailHelp:
		"L'e-mail ou le domaine d'e-mail que vous souhaitez bannir (ex. : utilisateur@domaine.com ou domaine.com). Rendez-vous à « Autoriser les adresses électroniques bannies » dans la rubrique Permissions pour davantage d'informations.",
	ip: "Adresse IP/plages d'adresses IP",
	ipHelp:
		"L'adresse IP ou la plage d'adresses IP que vous souhaitez bannir (ex. : 150.11.110.1 ou 150.11.110). Séparez les adresses par des espaces. Si une IP est déjà indiquée, il s'agit de la dernière adresse IP connue de cet utilisateur enregistrée dans la base de données.",
	ipStatsLink: 'Afficher les statistiques IP de cet utilisateur',
	advancedHead: 'Paramètres de bannissement avancés',
	advancedSubhead: 'Ajouter IP et e-mail pour compléter le bannissement',
	banMessage: 'Message de bannissement',
	banMessageHelp: "Un message qui s'affichera lors de la prochaine visite de l'utilisateur banni.",
	messageExpirySubhead: 'Message de bannissement et expiration',
	ipRangeInfo:
		"Vous devrez être très prudent lors du bannissement d'une plage d'IP puisqu'il est possible que plusieurs utilisateurs utilisent la même partie d'adresse IP.",
	expireDate: "Date d'expiration",
	expireDateHelp:
		'La date à laquelle ce bannissement devrait prendre automatiquement fin (format : AAAA-MM-JJ). Laissez vide pour une suppression manuelle.',
	save: 'Enregistrer',
	resultsHead: 'Résultats de la recherche',
	expire: 'Expire',
	never: 'Jamais',
	bannedBy: 'Banni par',
	unknown: 'Inconnu',
	noMatch: 'Pas de correspondance',
	edit: 'Modifier',
	remove: 'Supprimer',
	confirmRemove: 'Supprimer ce bannissement ?',
	goBack: 'Retour',
};
