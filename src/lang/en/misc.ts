/**
 * English translation of src/lang/fr/misc.ts (misc.php texts: rules, “mark as read”,
 * subscriptions, email to a member, reports).
 */

import type { EmailError, ReportError } from '../../services/contact.ts';
import type { misc as frMisc } from '../fr/misc.ts';

export const misc: typeof frMisc = {
	forumRules: 'Forum rules',
	markRead: 'Mark all topics as read',
	markForumRead: 'Mark this forum as read',
	/** Not in FluxBB: confirmation for an old GET link (Node doesn't write on a GET). */
	confirmMarkRead: 'All topics will be marked as read.',
	confirmMarkForumRead: 'All topics in this forum will be marked as read.',
	confirm: 'Confirm',

	// Subscriptions
	alreadySubscribedTopic: 'You are already following this topic.',
	alreadySubscribedForum: 'You are already following this forum.',
	notSubscribedTopic: 'You are not following this topic.',
	notSubscribedForum: 'You are not following this forum.',
	subscribeTopic: 'Follow this topic',
	subscribeForum: 'Follow this forum',
	unsubscribe: 'Unfollow',
	/** Not in FluxBB: confirmation for a GET link (old PHP pages, notification emails). */
	confirmSubscribeTopic: 'You will be notified by email of new replies to this topic.',
	confirmSubscribeForum: 'You will be notified by email of new topics in this forum.',
	confirmUnsubscribeTopic: 'You will no longer be notified of new replies to this topic.',
	confirmUnsubscribeForum: 'You will no longer be notified of new topics in this forum.',

	// Email to a member
	formEmailDisabled: 'The user you are trying to email has disabled the email form.',
	sendEmailTo: (username: string) => `Send an email to ${username}`,
	writeEmail: 'Write and send your email',
	emailSubject: 'Subject',
	emailMessage: 'Message',
	emailDisclosureNote: 'Please note that by using this form, you will reveal your email address to the recipient.',
	emailErrors: (error: EmailError): string => {
		switch (error.kind) {
			case 'noSubject':
				return 'You must enter a subject.';
			case 'noMessage':
				return 'You must enter a message.';
			case 'tooLong':
				return 'Messages cannot be longer than 65535 characters (64 KiB).';
			case 'flood':
				return `You must wait ${error.interval} seconds between emails. Please wait a moment before trying again.`;
		}
	},

	// Reports
	reportPost: 'Report a post',
	reason: 'Reason',
	reasonDesc: 'Enter the reason why you are reporting this post.',
	reportErrors: (error: ReportError): string => {
		switch (error.kind) {
			case 'noReason':
				return 'You must enter a reason.';
			case 'tooLong':
				return 'Your message must not exceed 65535 bytes (~64 KiB).';
			case 'flood':
				return `You must wait ${error.interval} seconds between reports. Please wait a moment before trying again.`;
		}
	},
	/** Not in FluxBB: title and intro of the error list, as in post.php. */
	formErrors: 'Errors in the form',
	formErrorsInfo: 'The following errors must be fixed:',
	submit: 'Submit',
	required: '(required)',
};
