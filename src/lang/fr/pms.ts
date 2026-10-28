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
		case 'userBlocked':
			return `${error.username} refuse les messages privés.`;
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
	sendingLists: "Listes d'envoi",
	contacts: 'Contacts',
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
	chooseList: "Ou choisir une liste d'envoi",
	selectAList: 'Sélectionner une liste',
	sendError: sendErrorText,
	sent: 'Message envoyé.',
	edited: 'Message modifié.',

	// Contacts
	addContact: 'Ajouter un contact',
	contactName: 'Nom du contact',
	refuseUser: 'Refuser les messages privés provenant de ce contact',
	add: 'Ajouter',
	rightsContact: 'Droits du contact',
	authorizedMessages: 'Messages autorisés',
	refusedMessages: 'Messages refusés',
	authorize: 'Autoriser',
	refuse: 'Refuser',
	authorizeFrom: (name: string) => `Autoriser ${name} à vous envoyer des messages privés`,
	refuseFrom: (name: string) => `Refuser les messages privés de ${name}`,
	quickMessage: 'Envoyer un message privé',
	quickMessageTo: (name: string) => `Envoyer un message privé à ${name}`,
	deleteContact: (name: string) => `Supprimer le contact ${name}`,
	selectContact: (name: string) => `Sélectionner ${name}`,
	noContacts: 'Aucun contact',
	mustSelectContacts: 'Vous devez sélectionner des contacts',
	userAlreadyContact: 'Cet utilisateur est déjà dans votre liste de contacts',
	userCannotUse: "L'utilisateur ne peut pas utiliser la messagerie",
	userNotExists: "L'utilisateur ne semble pas exister.",
	contactAdded: 'Contact ajouté.',
	contactStatusChanged: 'Statut du contact modifié.',
	contactsStatusChanged: 'Statuts des contacts modifiés.',
	contactsDeleted: 'Contacts supprimés.',
	confirmAddContact: (name: string) => `Ajouter ${name} à vos contacts ?`,
	confirmDeleteContact: 'Êtes-vous sûr de vouloir supprimer ce contact ?',
	confirmSwitchContact: (name: string) => `Changer les droits de ${name} ?`,
	deleteContactsComply: 'Êtes-vous sûr de vouloir supprimer les contacts sélectionnés ?',
	multideleteContacts: 'Supprimer plusieurs contacts',

	// Listes d'envoi
	addAList: 'Ajouter une liste',
	listName: 'Nom de la liste',
	listUsernamesComma: "Liste des noms d'utilisateur (séparés par des virgules)",
	listUsernames: "Liste des noms d'utilisateur",
	noSendingLists: "Aucune liste d'envoi",
	deleteThisList: 'Supprimer cette liste',
	selectList: (name: string) => `Sélectionner la liste ${name}`,
	mustSelectLists: 'Vous devez sélectionner des listes',
	yourself: "Vous ne pouvez pas vous inclure dans une liste d'envoi.",
	noListName: 'Vous devez donner un nom à la liste.',
	listAdded: "Liste d'envoi ajoutée.",
	listsDeleted: "Listes d'envoi supprimées.",
	confirmDeleteList: "Êtes-vous sûr de vouloir supprimer la liste d'envoi sélectionnée ?",
	deleteListsComply: "Êtes-vous sûr de vouloir supprimer les listes d'envoi sélectionnées ?",
	multideleteLists: 'Supprimer plusieurs listes',
	listErrors: "Erreurs dans la liste d'envoi",
	errorsTitle: 'Erreurs dans le message',
	errorsInfo: 'Les erreurs suivantes doivent être corrigées pour que le message puisse être envoyé :',
	formErrorsTitle: 'Erreur',
	formErrorsInfo: 'Les erreurs suivantes doivent être corrigées :',
};
