/**
 * Textes du compte Premium (premium.php). Le PHP les écrivait en dur dans la page.
 */

export const premium = {
	title: 'Compte premium',
	status: (state: string) => `Votre compte premium est ${state}.`,
	states: { active: 'actif', lifetime: 'actif à vie', inactive: 'inactif' },
	expiration: (date: string) => `Date d'expiration : ${date}`,
	neverPremium: "Vous n'avez pas encore de compte premium.",
	thanksActive: "Merci pour le soutien que vous apportez à Pilote-Virtuel. Cela nous permet d'apporter des améliorations au forum.",
	thanksLifetime: 'Merci pour le soutien que vous avez apporté à Pilote-Virtuel sur Tipeee. Votre compte est actif à vie.',
	activate: 'Activer votre compte',
	extend: 'Prolonger avec un code',
	codeLabel: 'Code',
	codePlaceholder: 'Entrez le code',
	activateButton: 'Activer',
	badCode: 'Ce code est invalide ou a déjà été utilisé.',
	activated: 'Votre compte premium a été activé. Merci !',
	notLoggedIn: 'Vous devez être identifié(e) sur le forum pour gérer votre compte premium.',
	errorsTitle: 'Erreur',
	errorsInfo: 'Le code n’a pas pu être utilisé :',
};
