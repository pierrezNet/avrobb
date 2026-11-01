/**
 * English translation of src/lang/fr/pms.ts (private messaging, APMS mod). “PM” is split into an
 * abbreviation and a title.
 */

import { forumNumberFormat } from '../../services/numberFormat.ts';
import { MAX_POST_SIZE } from '../../services/posting.ts';
import type { SendError } from '../../services/privateMessages.ts';
import type { pms as frPms } from '../fr/pms.ts';
import { post } from './post.ts';

function sendErrorText(error: SendError): string {
	switch (error.kind) {
		case 'flood':
			return `Please wait at least ${error.interval} seconds between messages. Try again in a little while.`;
		case 'senderFull':
			return "The message couldn't be saved: your boxes are full!";
		case 'noReceiver':
			return 'You must enter at least one recipient';
		case 'tooManyReceivers':
			return `You can send a message to at most ${error.max} recipients at a time.`;
		case 'noUser':
			return `There is no member with the username “${error.username}”.`;
		case 'userDisabled':
			return `${error.username} has disabled private messages.`;
		case 'receiverFull':
			return `${error.username}'s inbox is full, so you can't send a message to this user.`;
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

export const pms: typeof frPms = {
	pmAbbr: 'PM',
	pmTitle: 'Private messages',
	fullBoxes: 'Your private message boxes are full!',
	emptyBoxes: 'Your private message boxes are empty.',
	fullTo: (percent: number) => `Private message boxes ${percent}% full`,

	// Menu and pages
	pmMenu: 'Private messages',
	inbox: 'Inbox',
	writeMessage: 'New message',
	sendAMessage: 'Send a message',
	view: 'View a private conversation',

	// Inbox
	subject: 'Subject',
	sender: 'Sender',
	receivers: 'Recipient(s)',
	lastPost: 'Last message',
	by: (name: string) => `by ${name}`,
	deleted: '(deleted)',
	noMessages: 'No messages',
	unread: 'Unread',
	select: 'Select',
	selectConversation: (subject: string) => `Select “${subject}”`,
	forSelect: 'With selected:',
	markRead: 'Mark as read',
	markUnread: 'Mark as unread',
	delete: 'Delete',
	ok: 'OK',
	mustSelect: 'You must select some messages',
	readDone: 'The messages have been marked as read.',
	unreadDone: 'The messages have been marked as unread.',
	multidelete: 'Delete multiple messages',
	deleteMessagesComply: 'Are you sure you want to delete the selected messages?',
	deletedDone: 'Messages deleted.',

	// Conversation
	conversationTitle: (subject: string, participants: string) => `${subject} with ${participants}`,
	reply: 'Reply',
	quote: 'Quote',
	edit: 'Edit',
	quickPost: 'Reply',
	deleteMessage: 'Delete message',
	topicBy: (name: string, date: string) => `Conversation started by ${name} (${date})`,
	replyBy: (name: string, date: string) => `Reply by ${name} (${date})`,
	deleteWarning: 'You are about to permanently delete this message!',
	topicWarning: 'Warning! This is the first message of this conversation: the whole conversation will be deleted.',
	topicWarningInfo: "The conversation will disappear from your inbox but will stay in the other participants' inboxes.",
	deleteInfo: 'The message you want to delete is shown below so you can review it before continuing.',
	deleteForEverybody: 'Delete the conversation (or message) for all participants (only available to administrators and moderators).',

	// Writing
	sendTo: 'Send to',
	sendMultiple: (max: number) => `You can send the message to several recipients by separating them with commas. Maximum: ${max}`,
	sendError: sendErrorText,
	sent: 'Message sent.',
	edited: 'Message edited.',

	errorsTitle: 'Errors in the message',
	errorsInfo: 'The following errors must be fixed before the message can be sent:',
	formErrorsTitle: 'Error',
	formErrorsInfo: 'The following errors must be fixed:',
};
