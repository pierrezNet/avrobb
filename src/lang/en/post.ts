/**
 * English translation of src/lang/fr/post.ts: texts for writing and editing posts (post.php,
 * edit.php) and BBCode errors.
 */

import { forumNumberFormat } from '../../services/numberFormat.ts';
import { MAX_POST_SIZE, type PostError } from '../../services/posting.ts';
import type { PreparseError } from '../../services/preparse.ts';
import type { post as frPost } from '../fr/post.ts';
import { account } from './account.ts';

/** Errors from preparse_bbcode(); “message” means the text entered (post or signature). */
export function preparseErrorText(error: PreparseError): string {
	switch (error.kind) {
		case 'emptyAfterStrip':
			return 'It seems your post only contains empty BBCode tags. This may happen, for example, when the innermost quote was removed because quotes were nested deeper than allowed.';
		case 'signatureBlockTags':
			return 'The BBCode tags [quote], [code], [list] and [h] are not allowed in signatures.';
		case 'signatureLayoutTags':
			return 'Text alignment BBCode tags and the video tag are not allowed in signatures. Please correct.';
		case 'emptyAttribute':
			return `The [${error.tag}] tag has an empty attribute`;
		case 'tagNotAllowed':
			return error.tag === 'url' ? 'You are not allowed to post links' : `You are not allowed to use the [${error.tag}] tag`;
		case 'invalidNesting':
			return `The [${error.tag}] tag was opened within [${error.parent}], this is not allowed`;
		case 'invalidSelfNesting':
			return `The [${error.tag}] tag was opened within itself, this is not allowed`;
		case 'noOpeningTag':
			return `The [/${error.tag}] tag was found without a matching [${error.tag}] tag`;
		case 'noClosingTag':
			return `The [${error.tag}] tag was found without a matching [/${error.tag}] tag`;
	}
}

/** Validation errors of the post.php form. */
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
			return account.errors[error.error];
		case 'usernameDupe':
			return account.usernameDupe(error.existing);
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

export const post: typeof frPost = {
	// Validation
	noSubject: 'You must enter a subject.',
	noSubjectAfterCensoring: 'Topics must have a subject. After applying censor filters, your subject is empty.',
	tooLongSubject: 'Subjects cannot be longer than 70 characters.',
	noMessage: 'You must enter a message.',
	noMessageAfterCensoring: 'You must enter a message. After applying censor filters, your message is empty.',
	tooLongMessage: (bytes: string) => `Posts cannot be longer than ${bytes} bytes.`,
	allCapsSubject: 'Subjects cannot be written entirely in capital letters.',
	allCapsMessage: 'Posts cannot be written entirely in capital letters.',
	flood: (interval: number, wait: number) =>
		`At least ${interval} ${interval === 1 ? 'second' : 'seconds'} must pass between posts; wait ${wait} ${wait === 1 ? 'second' : 'seconds'} and try again.`,
	invalidEmail: 'The email address you entered is invalid.',
	bannedEmail: 'The email address you entered is banned from these forums. Please choose another one.',
	preparseError: preparseErrorText,
	postError: postErrorText,

	// Form
	postErrors: 'Post errors',
	noTagTitle: 'No project tag',
	noTagInfo:
		'Your topic does not say which project it is about. Add a tag with the buttons below the title: it helps find the discussions of each project. If none fits, click “Submit” again to post as is.',
	postErrorsInfo: 'The following errors must be corrected before the post can be sent:',
	postPreview: 'Post preview',
	guestName: 'Name',
	postReply: 'Reply',
	postNewTopic: 'New topic',
	hideSmilies: 'Do not convert smilies in this post',
	subscribe: 'Follow this topic',
	staySubscribed: 'Keep following this topic',
	topicReview: 'Topic review (newest posts first)',
	preview: 'Preview',
	writeMessageLegend: 'Write your message and submit',
	subject: 'Subject',
	message: 'Message',
	email: 'Email',
	required: '(required)',
	options: 'Options',
	submit: 'Submit',
	stickTopic: 'Stick topic',
	/** PV draft mod (lang/French/draft.php). */
	saveAsDraft: 'Save as draft. Uncheck to post the message.',
	/** Subject prefix buttons (project, other). */
	subjectPrefixes: 'Topic tag',
	projects: 'Project:',
	other: 'Other:',
	bbcode: 'BBCode:',
	urlTag: '[url] tag:',
	imgTag: '[img] tag:',
	smilies: 'Smilies:',
	on: 'on',
	off: 'off',
	galleryPicker: 'Gallery images',

	// Editing
	editPostLegend: 'Edit the post and submit your changes',
	silentEdit: 'Silent edit (the “Last edited by…” note will not be shown)',
	editPost: 'Edit post',

	/** Private message sent to the member mentioned (“@Name”) in a post. */
	mentionSubject: (author: string) => `${author} mentioned you`,
	mentionMessage: (author: string, link: string) => `[b]${author}[/b] mentioned you in the topic ${link}.`,
};
