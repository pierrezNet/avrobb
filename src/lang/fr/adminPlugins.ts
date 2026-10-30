/**
 * Textes des pages d'administration servies par admin_loader.php : balises du sujet et messagerie
 * privée (anciens plugins AP_*.php du PHP).
 */

export const adminPlugins = {
	privateMessages: {
		title: 'Messagerie privée',
		intro: 'Réglages de la messagerie privée et quotas de messages en fonction des groupes.',
		settings: 'Paramètres',
		enabled: 'Activer la messagerie personnelle',
		enabledHelp: "Permet d'activer ou non le système des messages privés.",
		notification: 'Permettre notification',
		notificationHelp: "Permet d'autoriser ou non les utilisateurs à utiliser la notification par e-mail de nouveaux messages privés.",
		maxReceivers: 'Nombre de destinataires',
		maxReceiversHelp: 'Le nombre maximum de destinataires par message privé.',
		permissions: 'Permissions',
		permissionsInfo:
			"Les administrateurs et les modérateurs n'ont pas de limite d'utilisation des messages privés. À l'inverse, les invités n'ont aucun droit. Enfin, vous pouvez régler les permissions des autres groupes ci-dessous.",
		allowGroup: (group: string) => `Permettre au groupe ${group} d'utiliser les messages privés`,
		limit: (group: string) => `Nombre maximum de messages dans les boîtes des ${group} (0 : aucune limite)`,
		yes: 'Oui',
		no: 'Non',
		save: 'Sauvegarder',
		saved: 'Options modifiées.',
	},

	labels: {
		title: 'Balises',
		intro: "Les balises du sujet, choisies par l'auteur, s'affichent en pastilles colorées devant le titre des discussions.",
		subjectTagsHead: 'Balises du sujet',
		subjectTagsInfo:
			"Proposées à l'auteur d'une discussion (boutons du formulaire, page « Balises du sujet »). Une balise absente de cette liste est retirée du sujet à l'enregistrement.",
		groups: { project: 'Projet', other: 'Autre' } as Record<string, string>,
		addSubjectTag: 'Ajouter une balise du sujet',
		subjectTagAddTitle: 'Ajout d’une balise du sujet',
		subjectTagEditTitle: 'Édition d’une balise du sujet',
		subjectTagName: 'Nom',
		subjectTagNameHelp: '1 à 20 caractères, sans crochets. Renommer une balise la renomme aussi dans les sujets existants.',
		subjectTagGroup: 'Groupe',
		subjectTagColor: 'Couleur de fond',
		subjectTagColorHelp: 'Le texte de la pastille passe en clair ou en foncé selon le fond, pour rester lisible.',
		moveUp: (name: string) => `Monter ${name}`,
		moveDown: (name: string) => `Descendre ${name}`,
		subjectTagDeleteTitle: 'Suppression d’une balise du sujet',
		subjectTagDeleteInfo: (name: string) =>
			`Supprimer la balise « ${name} » ? Elle ne sera plus proposée ni affichée ; les sujets qui la portent la perdront à leur prochaine modification.`,
		subjectTagErrors: {
			name: 'Le nom doit compter 1 à 20 caractères, sans crochets ni espace au début ou à la fin.',
			color: 'Choisissez une couleur.',
			duplicate: 'Une balise du sujet porte déjà ce nom.',
		} as Record<string, string>,
		subjectTagSaved: 'Balise du sujet enregistrée.',
		subjectTagRenamed: (count: number) => `Balise du sujet enregistrée et renommée dans ${count} sujet(s).`,
		subjectTagDeleted: 'Balise du sujet supprimée.',
		save: 'Enregistrer',
		edit: 'Modifier',
		delete: 'Supprimer',
		goBack: 'Retour',
	},
};
