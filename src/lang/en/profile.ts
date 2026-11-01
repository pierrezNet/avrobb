/**
 * English translation of src/lang/fr/profile.ts: profile texts (viewing and editing).
 */

import type { AvatarError } from '../../services/images.ts';
import type { LimitedField, ProfileError } from '../../services/profileForms.ts';
import type { profile as frProfile } from '../fr/profile.ts';
import { account } from './account.ts';
import { preparseErrorText } from './post.ts';

const FIELD_LABELS: Record<LimitedField, string> = {
	realname: 'Real name',
	title: 'Title',
	location: 'Location',
	url: 'Website',
	jabber: 'Jabber',
	icq: 'ICQ',
	msn: 'Microsoft account',
	aim: 'AOL IM',
	yahoo: 'Yahoo! Messenger',
	adminNote: 'Admin note',
	email: 'Email',
};

function profileErrorText(error: ProfileError): string {
	switch (error.kind) {
		case 'tooLong':
			return `The “${FIELD_LABELS[error.field]}” field cannot be longer than ${error.max} characters.`;
		case 'username':
			return account.errors[error.error];
		case 'usernameDupe':
			return `Someone is already registered with a similar username. ${error.existing}. This username is too similar. It must differ by at least one alphanumeric character (a-z or 0-9). Please choose another username.`;
		case 'invalidEmail':
			return 'The email address you entered is invalid.';
		case 'bannedEmail':
			return 'The email address you entered is banned from these forums. Please choose another one.';
		case 'dupeEmail':
			return 'This email address is already in use. Please choose another one.';
		case 'emailNotVerified':
			return 'The address can only be the verified address of your GitHub or Google account: you can remove it, but not replace it. To change it, write to an administrator.';
		case 'invalidWebsite':
			return 'The website URL you entered is invalid.';
		case 'websiteNotAllowed':
			return 'You are not allowed to add a website to your profile yet';
		case 'forbiddenTitle':
			return 'Your title contains a forbidden word. Please choose another title.';
		case 'badIcq':
			return 'You entered an invalid ICQ UIN. Please correct it.';
		case 'signatureTooLong':
			return `Signatures cannot be longer than ${error.max} characters. Please shorten your signature by ${error.excess} ${error.excess === 1 ? 'character' : 'characters'}.`;
		case 'signatureTooManyLines':
			return `Signatures cannot have more than ${error.max} lines.`;
		case 'bbcode':
			return preparseErrorText(error.error);
	}
}

function avatarErrorText(error: AvatarError, formatNumber: (n: number) => string): string {
	switch (error.kind) {
		case 'noFile':
			return 'You did not select a file to upload.';
		case 'badType':
			return 'This file type is not allowed. Supported formats: *.gif, *.jpeg, *.png and *.webp.';
		case 'tooLarge':
			return `The file is larger than the maximum allowed size of ${formatNumber(error.max)} bytes.`;
		case 'tooWideOrHigh':
			return `The image is wider and/or taller than the maximum allowed ${error.width}x${error.height} pixels.`;
	}
}

export const profile: typeof frProfile = {
	usersProfile: (username: string) => `${username}'s profile`,
	profile: 'Profile',
	sectionPersonal: 'Personal',
	sectionMessaging: 'Messaging',
	sectionPersonality: 'Personality',
	userActivity: 'User activity',
	username: 'Username',
	title: 'Title',
	realname: 'Real name',
	location: 'Location',
	website: 'Website',
	email: 'Email',
	sendEmail: 'Send email',
	pm: 'PM',
	pmTitle: 'Private messages',
	quickMessage: 'Send a private message',
	jabber: 'Jabber',
	icq: 'ICQ',
	msn: 'Microsoft account',
	aim: 'AOL IM',
	yahoo: 'Yahoo! Messenger',
	avatar: 'Avatar',
	signature: 'Signature',
	posts: 'Posts',
	showTopics: 'Show all topics',
	showPosts: 'Show posts by this user',
	showSubscriptions: 'Show all followed topics',
	lastPost: 'Last post',
	registered: 'Registered',

	// ——— Editing (profile.php, “edit” branch) ———
	profileMenu: 'Profile menu',
	sectionEssentials: 'Essentials',
	sectionDisplay: 'Display',
	sectionPrivacy: 'Privacy',
	sectionHeading: (username: string, section: string) => `${username} - ${section}`,
	profileError: profileErrorText,
	formErrors: 'Profile errors',
	formErrorsInfo: 'The following errors must be corrected before the profile can be saved:',
	updated: 'Profile updated.',
	instructions: 'After updating your profile, you will be redirected back to this page.',
	submit: 'Submit',
	required: '(required)',

	usernameAndPassLegend: 'Username',
	usernameInfo: (username: string) => `Username: ${username}`,
	emailLegend: 'Email address',
	emailOptional:
		'Optional: it is used for notifications (subscriptions, private messages) and is never shown to other members. It is the verified address of your GitHub or Google account, copied at your first login: you can remove it, but not replace it.',
	usernameOnce:
		'Your username comes from your login account. You can change it only once; after that, only an administrator can change it.',
	accountLegend: 'My account',
	deleteAccount: 'Delete my account',
	deleteAccountInfo:
		'Deleting your account erases your personal data, subscriptions, drafts, private messages, gallery images and avatar. Your public posts remain in their topics, under the name “Deleted member”.',
	confirmDeleteAccount: 'Permanently delete your account?',
	confirmDeleteAccountInfo:
		'Your personal data, subscriptions, drafts, private messages, gallery images and avatar will be erased. Your public posts will remain in their topics, under the name “Deleted member”. This cannot be undone; logging in again will create a new account.',
	deletedMember: 'Deleted member',
	accountDeleted: 'Your account has been deleted.',
	localisationLegend: 'Set your localization options',
	timeZone: 'Time zone',
	timeZoneInfo: 'For the forum to display times correctly, you must select your time zone.',
	dst: 'Daylight saving time: check this box if needed for the forums to display times correctly.',
	registeredInfo: (date: string) => `Registered: ${date}`,
	lastPostInfo: (date: string) => `Last post: ${date}`,
	lastVisitInfo: (date: string) => `Last visit: ${date}`,
	postsInfo: (count: string) => `Posts: ${count}`,
	adminNote: 'Admin note',

	personalDetailsLegend: 'Personal details',
	leaveBlank: 'Leave blank to use the forum default.',
	titleLeaveBlank: '(leave blank to use the default title)',

	contactDetailsLegend: 'Instant messaging details',

	avatarLegend: 'Set your avatar display options',
	avatarInfo:
		'An avatar is a small image that will be displayed with each of your posts. You can upload an avatar by clicking the link below.',
	changeAvatar: 'Change avatar',
	deleteAvatar: 'Delete avatar',
	uploadAvatar: 'Upload avatar',
	signatureLegend: 'Write your signature',
	signatureInfo:
		'A signature is a short text added after your posts. It can contain anything you like, and you can use BBCode tags depending on the forum settings. The enabled features are shown in the margin while you edit your signature.',
	sigMaxSize: (length: string, lines: number) => `${length} characters and ${lines} ${lines === 1 ? 'line' : 'lines'} allowed`,
	sigPreview: 'Current signature preview:',
	noSig: 'No signature in profile.',

	styleLegend: 'Choose your preferred style',
	styles: 'Styles',
	postDisplayLegend: 'Set your post display options',
	postDisplayInfo: 'Turning off all image and signature display options in posts will make pages load faster.',
	showSmilies: 'Show smilies as icons',
	showSigs: 'Show signatures.',
	showAvatars: 'Show user avatars.',
	showImages: 'Show images.',
	showImagesSigs: 'Show images in user signatures.',
	paginationLegend: 'Set your pagination options',
	topicsPerPage: 'Topics per page',
	postsPerPage: 'Posts per page',
	paginateInfo: 'Number of topics and posts to display per page.',
	manageReputation: 'Show reputation',
	manageReputationInfo:
		'You can turn off the reputation system; then nobody will be able to change your reputation. If you turn this option off, you will no longer be able to see or change other members’ reputation.',
	reputationOn: 'On',
	reputationOff: 'Off',

	privacyLegend: 'Set your privacy options',
	emailSettingInfo:
		'Choose whether other users can see your email address, and whether they can send you emails through these forums (email form).',
	emailSettings: [
		'Show your email address to other users',
		'Hide your email address but allow emails through the email form.',
		'Hide your email address and disallow the email form.',
	],
	subscriptionLegend: 'Set your topic following options',
	notifyFull: 'Include the post in reply notification emails.',
	autoNotifyFull: 'Automatically follow topics you reply to.',
	usePm: 'Enable private messages',
	notifyPm: 'Email notification of private messages',
	notifyPmInfo: 'With this option on, an email will be sent for every new private message.',
	notifyPmFull: 'Include the content of private messages',

	// Avatar (upload_avatar, delete_avatar actions)
	avatarsDisabled: 'Avatar support is disabled.',
	uploadAvatarLegend: 'Select an avatar file to upload',
	file: 'File',
	upload: 'Upload',
	avatarDesc: (width: number, height: number, bytes: string, size: string) =>
		`An avatar is a small image that will be displayed under your username in your posts. A larger image is automatically reduced to at most ${width} × ${height} pixels and ${bytes} bytes (${size}).`,
	avatarError: avatarErrorText,
	confirmDeleteAvatar: 'Delete avatar?',
	confirmDeleteAvatarInfo: 'Your current avatar will be permanently deleted.',
};
