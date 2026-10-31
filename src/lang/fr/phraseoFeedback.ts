/**
 * Textes des retours de l'application Phraséo : sujets créés dans le forum privé « à trier » à partir
 * du formulaire « J'ai un retour » (sans compte), reçus du relais de Phraséo (worker.ts).
 */

export const phraseoFeedback = {
	/** Compte système de la migration 0005 qui signe les sujets (même nom qu'en base). */
	authorName: 'Retours Phraséo',
	/** Balise de projet en tête du sujet. */
	subjectTag: '[Phraséo]',
	/** Début du sujet, après la balise et le type : « [Phraséo] Bug technique : … ». */
	subjectSeparator: ' : ',
	fields: {
		type: 'Type',
		mode: 'Règle de vol',
		level: 'Niveau',
		lang: 'Langue',
	},
	/** Champ non renseigné dans le formulaire. */
	none: '—',
	/** Rappel en tête du message : le contact n'est jamais publié. */
	header:
		"Retour envoyé depuis l'application Phraséo, sans compte. Le contact éventuel de l'auteur a été envoyé par e-mail aux administrateurs ; il ne figure pas ici.",
	/** Contact absent, dans l'e-mail aux administrateurs. */
	noContact: 'aucun',
};
