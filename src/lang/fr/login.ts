/**
 * Textes de la connexion : fournisseurs SSO (GitHub, Google), connexion de développement,
 * déconnexion.
 */

export const login = {
	login: 'Connexion',
	logout: 'Déconnexion',
	intro:
		'AvroBB n’a pas de mot de passe : vous vous connectez avec un compte existant. À la première connexion, votre compte AvroBB est créé, avec un nom d’utilisateur tiré de ce compte, que vous pourrez changer une fois dans votre profil.',
	providers: { github: 'GitHub', google: 'Google' } as Record<'github' | 'google', string>,
	signInWith: (provider: string) => `Se connecter avec ${provider}`,
	noProvider: 'Aucun fournisseur de connexion n’est configuré pour le moment.',
	privacyInfo: 'Ce que nous recevons de ce compte est décrit dans la',
	privacyLink: 'politique de confidentialité',
	ssoCancelled: 'Connexion annulée.',
	ssoExpired: 'La tentative de connexion a expiré ou ne vient pas de ce navigateur. Recommencez depuis la page de connexion.',
	ssoFailed: (provider: string) => `La connexion avec ${provider} a échoué. Réessayez dans quelques instants.`,
	tooManyAttempts: 'Trop de tentatives de connexion. Réessayez dans une minute.',
	/** Pseudo d'un nouveau compte quand aucun nom du fournisseur ne convient. */
	defaultUsername: 'Membre',
	username: "Nom d'utilisateur",
	required: '(obligatoire)',
	unknownUser: "Aucun membre ne porte ce nom d'utilisateur.",
	devLoginLegend: 'Connexion de développement',
	devLoginInfo: "Réservée au développement, depuis cette machine : on se connecte sous le nom d'un membre existant, sans mot de passe.",
	submit: 'Se connecter',
	devLoginRefused: "La connexion de développement n'est pas disponible.",
	logoutEverywhere: 'Me déconnecter de partout',
	logoutEverywhereInfo: 'Ferme votre session sur tous les appareils et navigateurs, celui-ci compris.',
};
