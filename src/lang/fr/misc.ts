/**
 * Textes de misc.php (règles, « marquer comme lu », abonnements). Source : lang/French/misc.php,
 * topic.php, forum.php et register.php.
 */

import type { EmailError, ReportError } from '../../services/contact.ts';

export const misc = {
	forumRules: "Conditions d'utilisation des forums",
	markRead: 'Marquer toutes les discussions comme lues',
	markForumRead: 'Marquer ce forum comme lu',
	/** Absent de FluxBB : confirmation d'un ancien lien GET (Node n'écrit pas sur un GET). */
	confirmMarkRead: 'Toutes les discussions seront marquées comme lues.',
	confirmMarkForumRead: 'Toutes les discussions de ce forum seront marquées comme lues.',
	confirm: 'Confirmer',

	// Abonnements
	alreadySubscribedTopic: 'Vous suivez déjà cette discussion.',
	alreadySubscribedForum: 'Vous suivez déjà ce forum.',
	notSubscribedTopic: 'Vous ne suivez pas cette discussion.',
	notSubscribedForum: 'Vous ne suivez pas ce forum.',
	subscribeTopic: 'Suivre cette discussion',
	subscribeForum: 'Suivre ce forum',
	unsubscribe: 'Ne plus suivre',
	/** Absents de FluxBB : confirmation d'un lien GET (anciennes pages PHP, e-mails de notification). */
	confirmSubscribeTopic: 'Vous serez prévenu·e par e-mail des nouvelles réponses à cette discussion.',
	confirmSubscribeForum: 'Vous serez prévenu·e par e-mail des nouvelles discussions de ce forum.',
	confirmUnsubscribeTopic: 'Vous ne serez plus prévenu·e des nouvelles réponses à cette discussion.',
	confirmUnsubscribeForum: 'Vous ne serez plus prévenu·e des nouvelles discussions de ce forum.',

	// E-mail à un membre
	formEmailDisabled: "L'utilisateur à qui vous essayez d'envoyer un e-mail a désactivé le formulaire e-mail.",
	sendEmailTo: (username: string) => `Envoyer un e-mail à ${username}`,
	writeEmail: 'Composez et envoyez votre e-mail',
	emailSubject: 'Sujet',
	emailMessage: 'Message',
	emailDisclosureNote: "Veuillez prendre note qu'en utilisant ce formulaire, vous divulguerez votre adresse électronique au destinataire.",
	emailErrors: (error: EmailError): string => {
		switch (error.kind) {
			case 'noSubject':
				return 'Vous devez indiquer un sujet.';
			case 'noMessage':
				return 'Vous devez saisir un message.';
			case 'tooLong':
				return 'Les messages ne peuvent contenir plus de 65535 caractères (64 Kio).';
			case 'flood':
				return `L'intervalle d'envoi consécutif d'e-mails est de ${error.interval} secondes. Veuillez patienter un moment avant de tenter d'envoyer à nouveau.`;
		}
	},

	// Signalement
	reportPost: 'Signaler un message',
	reason: 'Motif',
	reasonDesc: 'Indiquez la raison pour laquelle vous signalez ce message.',
	reportErrors: (error: ReportError): string => {
		switch (error.kind) {
			case 'noReason':
				return 'Vous devez indiquer un motif.';
			case 'tooLong':
				return 'Votre message ne doit pas dépasser 65535 octets (~64 Kio).';
			case 'flood':
				return `L'intervalle d'envoi consécutif de signalements est de ${error.interval} secondes. Veuillez patienter un moment avant de tenter d'envoyer à nouveau.`;
		}
	},
	/** Absents de FluxBB : titre et introduction de la liste d'erreurs, comme post.php. */
	formErrors: 'Erreurs dans le formulaire',
	formErrorsInfo: 'Les erreurs suivantes doivent être corrigées\u00a0:',
	submit: 'Valider',
	required: '(obligatoire)',
};
