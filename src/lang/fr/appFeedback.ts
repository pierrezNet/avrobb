/**
 * Textes des retours des applications sources (Phraséo, Donne Ton Point) : sujets créés dans le
 * forum privé « à trier » de chaque application à partir de son formulaire « J'ai un retour » (sans
 * compte), reçus de son relais (worker.ts).
 */

import type { FeedbackSourceId } from '../../domain/models.ts';
import type { FeedbackTexts } from '../../services/appFeedback.ts';

/** Champ non renseigné dans le formulaire. */
const none = '—';
/** Début du sujet, après la balise et le type : « [Phraséo] Bug technique : … ». */
const subjectSeparator = ' : ';
/** Pseudo absent, dans l'e-mail aux administrateurs. */
const anonymous = 'un anonyme';
/** Contact absent, dans l'e-mail aux administrateurs. */
const noContact = 'aucun';
const fields = { pseudo: 'Envoyé par', type: 'Type', lang: 'Langue' };

export const appFeedback: Readonly<Record<FeedbackSourceId, FeedbackTexts>> = {
	phraseo: {
		appName: 'Phraséo',
		/** Compte système de la migration 0005 qui signe les sujets (même nom qu'en base). */
		authorName: 'Retours Phraséo',
		/** Balise de projet en tête du sujet. */
		subjectTag: '[Phraséo]',
		subjectSeparator,
		fields,
		details: { mode: 'Règle de vol', level: 'Niveau' },
		none,
		/** Rappel en tête du message : le contact n'est jamais publié. */
		header:
			"Retour envoyé depuis l'application Phraséo, sans compte. Le contact éventuel de l'auteur a été envoyé par e-mail aux administrateurs ; il ne figure pas ici.",
		/** Rappel une fois le retour accepté et publié dans le forum public. */
		publicHeader: "Retour d'un utilisateur de l'application Phraséo, envoyé sans compte.",
		anonymous,
		noContact,
	},
	donneTonPoint: {
		appName: 'Donne Ton Point',
		/** Compte système de la migration 0008 (même nom qu'en base). */
		authorName: 'Retours Donne Ton Point',
		subjectTag: '[Donne Ton Point]',
		subjectSeparator,
		fields,
		details: {},
		none,
		header:
			"Retour envoyé depuis l'application Donne Ton Point, sans compte. Le contact éventuel de l'auteur a été envoyé par e-mail aux administrateurs ; il ne figure pas ici.",
		publicHeader: "Retour d'un utilisateur de l'application Donne Ton Point, envoyé sans compte.",
		anonymous,
		noContact,
	},
};
