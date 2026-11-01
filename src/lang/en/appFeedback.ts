/**
 * English translation of src/lang/fr/appFeedback.ts: feedback from source apps (Phraséo, Donne Ton
 * Point), turned into topics in each app's private “to sort” forum.
 *
 * Deliberately left in French: these texts compose the subjects and posts stored in the database
 * (the header is also matched verbatim when a feedback is accepted), the system account names must
 * match the database, and the e-mail to administrators is written in French.
 */

import type { FeedbackSourceId } from '../../domain/models.ts';
import type { FeedbackTexts } from '../../services/appFeedback.ts';
import type { appFeedback as frAppFeedback } from '../fr/appFeedback.ts';

/** Empty form field. */
const none = '—';
/** Start of the subject, after the tag and type: “[Phraséo] Bug technique : …”. */
const subjectSeparator = ' : ';
/** Missing pseudonym, in the e-mail to administrators. */
const anonymous = 'un anonyme';
/** Missing contact, in the e-mail to administrators. */
const noContact = 'aucun';
const fields = { pseudo: 'Envoyé par', type: 'Type', lang: 'Langue' };

export const appFeedback: typeof frAppFeedback & Readonly<Record<FeedbackSourceId, FeedbackTexts>> = {
	phraseo: {
		appName: 'Phraséo',
		/** System account from migration 0005 that signs the topics (same name as in the database). */
		authorName: 'Retours Phraséo',
		/** Project tag at the start of the subject. */
		subjectTag: '[Phraséo]',
		subjectSeparator,
		fields,
		details: { mode: 'Règle de vol', level: 'Niveau' },
		none,
		/** Reminder at the top of the post: the contact is never published. */
		header:
			"Retour envoyé depuis l'application Phraséo, sans compte. Le contact éventuel de l'auteur a été envoyé par e-mail aux administrateurs ; il ne figure pas ici.",
		/** Reminder once the feedback is accepted and published in the public forum. */
		publicHeader: "Retour d'un utilisateur de l'application Phraséo, envoyé sans compte.",
		anonymous,
		noContact,
	},
	donneTonPoint: {
		appName: 'Donne Ton Point',
		/** System account from migration 0008 (same name as in the database). */
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
