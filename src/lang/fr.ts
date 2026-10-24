/**
 * Chaînes françaises utilisées par le prototype (reprises de lang/French de PiloteVirtuel).
 */

import type { DateWords } from '../services/dateFormat.ts';

export const fr = {
	langCode: 'fr',
	index: 'Index',
	userList: 'Liste des membres',
	search: 'Rechercher',
	profile: 'Profil',
	login: 'Connexion',
	register: 'Inscription',
	logout: 'Déconnexion',
	loggedInAs: 'Connecté(e) en tant que',
	notLoggedIn: "Vous n'êtes pas connecté(e).",
	pages: 'Pages :',
	previous: 'Précédent',
	next: 'Suivant',
	postReply: 'Répondre',
	topicClosed: 'Discussion fermée',
	re: 'Re :',
	online: 'En ligne',
	offline: 'Hors ligne',
	from: 'Lieu :',
	registered: 'Inscription :',
	posts: 'Messages :',
	email: 'E-mail',
	website: 'Site web',
	ipLogged: 'IP enregistrée',
	note: 'Note :',
	report: 'Signaler',
	delete: 'Supprimer',
	edit: 'Modifier',
	quote: 'Citer',
	lastEdit: 'Dernière modification par',
	guest: 'Invité',
	member: 'Membre',
	badRequest: 'Mauvaise requête. Le lien que vous avez suivi est incorrect ou périmé.',
	noView: "Vous n'avez pas la permission d'accéder à ces pages.",
	info: 'Information',
	goBack: 'Retour',
	poweredBy: 'Propulsé par',
	prototype: 'Prototype Node.js — lecture seule',
} as const;

export const frDateWords: DateWords = {
	today: "Aujourd'hui",
	yesterday: 'Hier',
	never: 'Jamais',
	days: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
	months: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
};

export type Lang = typeof fr;
