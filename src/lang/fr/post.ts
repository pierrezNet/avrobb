/**
 * Textes de la rédaction (post.php, edit.php). Source : lang/French/post.php, et pour les erreurs
 * de BBCode lang/French/common.php, profile.php et fluxtoolbar.php.
 */

import { forumNumberFormat } from '../../services/numberFormat.ts';
import { MAX_POST_SIZE, type PostError } from '../../services/posting.ts';
import type { PreparseError } from '../../services/preparse.ts';
import { register } from './register.ts';

/** Erreurs de preparse_bbcode() ; « message » désigne le texte saisi (message ou signature). */
export function preparseErrorText(error: PreparseError): string {
	switch (error.kind) {
		case 'emptyAfterStrip':
			return "Il semblerait que votre message ne comporte que des balises BBCode vides. Il est possible que cela se soit passé par exemple parce que la citation imbriquée la plus ancienne a été supprimé pour cause de niveau d'imbrication de citations supérieur à celui autorisé.";
		case 'signatureBlockTags':
			return "L'utilisation des balises BBCode [quote], [code], [list] et [h] n'est pas autorisée dans les signatures.";
		case 'signatureLayoutTags':
			return "Les balises BBCode d'alignement du texte et la balise vidéo ne sont pas autorisées dans les signatures. Veuillez corriger.";
		case 'emptyAttribute':
			return `La balise [${error.tag}] comporte un attribut non défini`;
		case 'tagNotAllowed':
			return error.tag === 'url'
				? "Vous n'êtes pas autorisé à mettre des liens"
				: `Vous n'êtes pas autorisé à utiliser la balise [${error.tag}]`;
		case 'invalidNesting':
			return `La balise [${error.tag}] a été ouverte dans la balise [${error.parent}], ceci n'est pas autorisé`;
		case 'invalidSelfNesting':
			return `La balise [${error.tag}] a été ouverte dans cette même balise, ceci n'est pas autorisé`;
		case 'noOpeningTag':
			return `La balise [/${error.tag}] a été trouvée sans balise [${error.tag}] correspondante`;
		case 'noClosingTag':
			return `La balise [${error.tag}] a été trouvée sans balise [/${error.tag}] correspondante`;
	}
}

/** Erreurs de validation du formulaire de post.php. */
export function postErrorText(error: PostError): string {
	switch (error.kind) {
		case 'flood':
			return post.flood(error.interval, error.wait);
		case 'noSubject':
			return post.noSubject;
		case 'noSubjectAfterCensoring':
			return post.noSubjectAfterCensoring;
		case 'tooLongSubject':
			return post.tooLongSubject;
		case 'allCapsSubject':
			return post.allCapsSubject;
		case 'username':
			return register.errors[error.error];
		case 'usernameDupe':
			return register.usernameDupe(error.existing);
		case 'invalidEmail':
			return post.invalidEmail;
		case 'bannedEmail':
			return post.bannedEmail;
		case 'tooLongMessage':
			return post.tooLongMessage(forumNumberFormat(MAX_POST_SIZE));
		case 'allCapsMessage':
			return post.allCapsMessage;
		case 'bbcode':
			return preparseErrorText(error.error);
		case 'noMessage':
			return post.noMessage;
		case 'noMessageAfterCensoring':
			return post.noMessageAfterCensoring;
	}
}

export const post = {
	// Validation
	noSubject: 'Vous devez indiquer un sujet.',
	noSubjectAfterCensoring:
		"Les discussions doivent comporter un sujet. Après application des filtres de censure, le sujet n'est pas indiqué.",
	tooLongSubject: 'Le sujet ne peut contenir plus de 70 caractères.',
	noMessage: 'Vous devez saisir un message.',
	noMessageAfterCensoring: 'Vous devez saisir un message. Après application des filtres de censure, votre message est vide.',
	tooLongMessage: (bytes: string) => `Les messages ne peuvent contenir plus de ${bytes} octets.`,
	allCapsSubject: "Il n'est pas autorisé d'écrire un sujet entièrement en lettres capitales.",
	allCapsMessage: "Il n'est pas autorisé d'écrire un message entièrement en lettres capitales.",
	flood: (interval: number, wait: number) =>
		`Au moins ${interval} secondes doivent s'écouler entre deux messages ; attendez ${wait} secondes puis essayez à nouveau.`,
	invalidEmail: "L'adresse électronique que vous avez saisie est invalide.",
	bannedEmail: "L'adresse électronique saisie est bannie de ces forums. Veuillez en choisir une autre.",
	preparseError: preparseErrorText,
	postError: postErrorText,

	// Formulaire
	postErrors: 'Erreurs dans le message',
	postErrorsInfo: 'Les erreurs suivantes doivent être corrigées pour que le message puisse être envoyé :',
	postPreview: 'Prévisualisation du message',
	guestName: 'Nom',
	postReply: 'Répondre',
	postNewTopic: 'Nouvelle discussion',
	hideSmilies: 'Ne pas convertir les émoticônes dans ce message',
	subscribe: 'Suivre cette discussion',
	staySubscribed: 'Continuer à suivre cette discussion',
	topicReview: 'Résumé de la discussion (messages les plus récents en premier)',
	preview: 'Prévisualisation',
	writeMessageLegend: "Veuillez composer votre message et l'envoyer",
	subject: 'Sujet',
	message: 'Message',
	email: 'E-mail',
	required: '(obligatoire)',
	options: 'Options',
	submit: 'Valider',
	stickTopic: 'Épingler la discussion',
	/** Mod brouillon de PV (lang/French/draft.php). */
	saveAsDraft: 'Enregistrer comme brouillon. Décocher pour poster le message.',
	/** Boutons de préfixe du sujet (simulateur, autre) propres à PV. */
	subjectPrefixes: 'Préfixe du sujet',
	simulators: 'Simu :',
	other: 'Autre :',
	bbcode: 'BBCode :',
	urlTag: 'Balise [url] :',
	imgTag: 'Balise [img] :',
	smilies: 'Émoticônes :',
	on: 'activé',
	off: 'désactivé',
	/** Gestionnaire d'envois de PV (mod Uploadile, lang/French/uploadile.php). */
	fileManager: 'Gestion de mes uploads',

	// Modification
	editPostLegend: 'Modifier le message et valider les modifications',
	silentEdit: "Modification anonyme (la mention « Dernière modification par… » ne s'affichera pas)",
	editPost: 'Modifier le message',
};
