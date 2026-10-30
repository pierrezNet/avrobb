/**
 * Textes de la messagerie privée (mod APMS). Source : lang/French/pms.php. « PM » y vaut
 * <acronym title="Messages Privés">MP</acronym> : découpé ici en abréviation + titre. Les
 * « Redirection... » du PHP deviennent des avis affichés après la redirection.
 */

import { forumNumberFormat } from '../../services/numberFormat.ts';
import { MAX_POST_SIZE } from '../../services/posting.ts';
import type { SendError } from '../../services/privateMessages.ts';
import { post } from './post.ts';

function sendErrorText(error: SendError): string {
	switch (error.kind) {
		case 'flood':
			return `Patientez au moins ${error.interval} secondes entre deux messages. Merci d'essayer à nouveau un peu plus tard.`;
		case 'senderFull':
			return "Impossible d'enregistrer le message, vos boîtes sont pleines !";
		case 'noReceiver':
			return 'Vous devez indiquer au moins un destinataire';
		case 'tooManyReceivers':
			return `Vous ne pouvez envoyer un message qu'à ${error.max} destinataires maximum à la fois.`;
		case 'noUser':
			return `Il n'y a pas de membre avec le nom d'utilisateur « ${error.username} ».`;
		case 'userDisabled':
			return `${error.username} a désactivé les messages privés.`;
		case 'receiverFull':
			return `La boîte de réception de ${error.username} est pleine, vous ne pouvez pas envoyer de message à cet utilisateur.`;
		case 'noSubject':
			return post.noSubject;
		case 'tooLongSubject':
			return post.tooLongSubject;
		case 'noMessage':
			return post.noMessage;
		case 'tooLongMessage':
			return post.tooLongMessage(forumNumberFormat(MAX_POST_SIZE));
		case 'bbcode':
			return post.preparseError(error.error);
	}
}

export const pms = {
	pmAbbr: 'MP',
	pmTitle: 'Messages privés',
	fullBoxes: 'Vos boîtes de messages privés sont pleines !',
	emptyBoxes: 'Vos boîtes de messages privés sont vides.',
	fullTo: (percent: number) => `Boîtes de messages privés pleines à ${percent} %`,

	// Menu et pages
	pmMenu: 'Messagerie privée',
	inbox: 'Boîte de réception',
	writeMessage: 'Nouveau message',
	sendAMessage: 'Envoyer un message',
	view: 'Voir une discussion privée',

	// Boîte de réception
	subject: 'Sujet',
	sender: 'Expéditeur',
	receivers: 'Destinataire(s)',
	lastPost: 'Dernier message',
	by: (name: string) => `par ${name}`,
	deleted: '(supprimé)',
	noMessages: 'Aucun message',
	unread: 'Non lu',
	select: 'Sélection',
	selectConversation: (subject: string) => `Sélectionner « ${subject} »`,
	forSelect: 'Pour la sélection :',
	markRead: 'Marquer comme lus',
	markUnread: 'Marquer comme non lus',
	delete: 'Supprimer',
	ok: 'OK',
	mustSelect: 'Vous devez sélectionner des messages',
	readDone: 'Les messages ont été marqués comme lus.',
	unreadDone: 'Les messages ont été marqués comme non lus.',
	multidelete: 'Supprimer plusieurs messages',
	deleteMessagesComply: 'Êtes-vous sûr de vouloir supprimer les messages sélectionnés ?',
	deletedDone: 'Messages supprimés.',

	// Conversation
	conversationTitle: (subject: string, participants: string) => `${subject} avec ${participants}`,
	reply: 'Répondre',
	quote: 'Citer',
	edit: 'Modifier',
	quickPost: 'Réponse',
	deleteMessage: 'Supprimer le message',
	topicBy: (name: string, date: string) => `Discussion démarrée par ${name} (${date})`,
	replyBy: (name: string, date: string) => `Réponse de ${name} (${date})`,
	deleteWarning: 'Vous êtes sur le point de supprimer définitivement ce message !',
	topicWarning: 'Attention ! Ceci est le premier message de cette discussion, toute la discussion sera supprimée.',
	topicWarningInfo: 'Le sujet disparaîtra de votre boîte de réception mais restera dans celle des autres participants.',
	deleteInfo: 'Le message que vous souhaitez supprimer vous est présenté ci-dessous afin que vous puissiez le revoir avant de continuer.',
	deleteForEverybody:
		'Supprimer la discussion (ou le message) pour tous les participants (option disponible seulement pour les administrateurs et modérateurs).',

	// Écriture
	sendTo: 'Envoyer à',
	sendMultiple: (max: number) =>
		`Vous pouvez envoyer le message à plusieurs destinataires en les séparant par des virgules. Maximum : ${max}`,
	sendError: sendErrorText,
	sent: 'Message envoyé.',
	edited: 'Message modifié.',

	errorsTitle: 'Erreurs dans le message',
	errorsInfo: 'Les erreurs suivantes doivent être corrigées pour que le message puisse être envoyé :',
	formErrorsTitle: 'Erreur',
	formErrorsInfo: 'Les erreurs suivantes doivent être corrigées :',
};
