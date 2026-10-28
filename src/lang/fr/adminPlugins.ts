/**
 * Textes des plugins d'administration portés (plugins/AMP_*.php, AP_*.php).
 */

export const adminPlugins = {
	userManagement: {
		title: "Gestion d'utilisateur",
		intro:
			"Ce plugin vous permet d'ajouter des utilisateurs manuellement, ce qui est utile pour les forums fermés, par exemple si vous avez empêché les nouvelles inscriptions dans Options.",
		addHead: "Ajout d'utilisateur",
		username: "Nom d'utilisateur",
		email: 'E-mail',
		randomPass: 'Générer un mot de passe aléatoire ?',
		randomPassHelp: "Si oui, un mot de passe aléatoire sera créé et envoyé à l'adresse e-mail ci-dessus.",
		password: 'Mot de passe',
		passwordHelp: 'Si vous ne désirez pas un mot de passe aléatoire.',
		yes: 'Oui',
		no: 'Non',
		create: 'Créer !',
		created: "L'utilisateur a été créé.",
	},
};
