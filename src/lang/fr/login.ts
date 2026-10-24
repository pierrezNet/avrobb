/**
 * Textes de la connexion. Source : lang/French/login.php.
 */

export const login = {
	login: 'Identification',
	logout: 'Déconnexion',
	username: "Nom d'utilisateur",
	password: 'Mot de passe',
	required: '(obligatoire)',
	wrongUserPass: "Nom d'utilisateur et/ou mot de passe incorrect.",
	forgottenPass: 'Mot de passe oublié ?',
	notRegistered: 'Pas encore inscrit ?',
	register: 'Inscription',
	loginLegend: "Indiquez ci-dessous votre nom d'utilisateur et votre mot de passe",
	rememberMe: 'Me connecter automatiquement lors de mes prochaines visites.',
	loginInfo:
		"Si vous n'êtes pas encore inscrit(e) ou si vous avez oublié votre mot de passe, veuillez cliquer sur le lien approprié ci-dessous.",
	submit: 'Valider',
	requestPass: 'Demande de mot de passe',
	requestPassLegend: "Indiquez l'adresse électronique utilisée lors de l'inscription",
	requestPassInfo: 'Un nouveau mot de passe ainsi que le lien pour activer ce nouveau mot de passe vont être envoyés à cette adresse.',
	email: 'E-mail',
	invalidEmail: "L'adresse électronique que vous avez saisie est invalide.",
	noEmailMatch: (email: string) => `Aucun utilisateur inscrit n'utilise cette adresse électronique : ${email}.`,
	newPasswordErrors: 'Erreur pour demande de mot de passe',
	newPasswordErrorsInfo: "Les erreurs suivantes doivent être corrigées avant qu'un nouveau mot de passe puisse être envoyé :",
	forgetMail:
		"Un e-mail contenant des instructions pour modifier votre mot de passe vient d'être envoyé à l'adresse indiquée. Si vous ne le recevez pas, vous pouvez contacter l'administrateur des forums :",
	emailFlood: (minutes: number) =>
		`Une réinitialisation du mot de passe de ce compte a été effectuée il y a moins d'une heure. Veuillez patienter ${minutes} minutes avant de réclamer un nouveau mot de passe.`,
};
