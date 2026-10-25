/**
 * Modèles de vue de la messagerie privée (mod APMS) : boîte de réception, conversation, formulaire
 * d'envoi, contacts et listes d'envoi. Fonctions pures.
 */

import {
	type BoardConfig,
	GroupId,
	type PrivateContact,
	type PrivateConversation,
	type PrivateMessage,
	type PrivateMessageWithAuthor,
	type SendingList,
	type Viewer,
} from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { parseMessage, parseSignature } from '../services/bbcode.ts';
import type { Censor } from '../services/censor.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import { isAnyModerator } from '../services/permissions.ts';
import { canEditPrivateMessage } from '../services/privateMessages.ts';
import { userTitle } from '../services/userTitle.ts';
import { type PaginationLink, paginationLinks } from './navigation.ts';
import { messageParserOptions, signatureParserOptions } from './parserOptions.ts';
import { type BbcodeStatus, bbcodeStatus } from './postPage.ts';
import type { MenuItem } from './profileEditPage.ts';
import { authorContactLinks, type PostAction, type PostView } from './topicPage.ts';

export type PmPage = 'inbox' | 'send' | 'lists' | 'contacts';

/** Menu « Messagerie privée » commun aux pages pms_*.php. */
export function pmMenu(active: PmPage, lang: Lang): MenuItem[] {
	const t = lang.pms;
	const item = (page: PmPage, href: string, label: string): MenuItem => ({ href, label, active: page === active });
	return [
		item('inbox', 'pms_inbox.php', t.inbox),
		item('send', 'pms_send.php', t.writeMessage),
		item('lists', 'pms_sending_lists.php', t.sendingLists),
		item('contacts', 'pms_contacts.php', t.contacts),
	];
}

interface DateContext {
	viewer: Viewer;
	dateWords: DateWords;
	now: number;
}

const formatDate = (context: DateContext, timestamp: number | null): string =>
	formatTime(timestamp, viewerTimeSettings(context.viewer), context.dateWords, context.now);

/** Lien vers un profil si le lecteur peut consulter les membres (g_view_users). */
const profileLink = (viewer: Viewer, id: number, label: string): { href: string | null; label: string } => ({
	href: viewer.group.canViewUsers && id > 1 ? `profile.php?id=${id}` : null,
	label,
});

// ——— Boîte de réception ———

export interface ConversationRowView {
	sharedId: number;
	href: string;
	subject: string;
	unread: boolean;
	sender: { href: string | null; label: string };
	receivers: { href: string | null; label: string }[];
	lastPost: { href: string; at: string; by: string } | null;
	selectLabel: string;
}

export interface InboxView {
	menu: MenuItem[];
	conversations: ConversationRowView[];
	pagination: PaginationLink[];
	notice: string | null;
	errors: string[];
}

export function conversationUrl(conversation: { sharedId: number; messageId: number }): string {
	return `pms_view.php?tid=${conversation.sharedId}&mid=${conversation.messageId}`;
}

/** Participants affichés, avec la mention « (supprimé) » pour ceux qui ont quitté la conversation. */
function participantLabels(conversation: PrivateConversation, viewer: Viewer, lang: Lang): { href: string | null; label: string }[] {
	return conversation.participants.map((participant) =>
		profileLink(viewer, participant.id, participant.deleted ? `${participant.username} ${lang.pms.deleted}` : participant.username),
	);
}

export function buildInbox(
	input: DateContext & {
		conversations: readonly PrivateConversation[];
		page: number;
		numPages: number;
		lang: Lang;
		notice: string | null;
		errors: string[];
	},
): InboxView {
	const { viewer, lang } = input;
	return {
		menu: pmMenu('inbox', lang),
		conversations: input.conversations.map((conversation) => {
			const href = conversationUrl(conversation);
			return {
				sharedId: conversation.sharedId,
				href,
				subject: conversation.subject,
				unread: conversation.unread,
				sender: profileLink(viewer, conversation.senderId, conversation.sender),
				receivers: participantLabels(conversation, viewer, lang),
				lastPost:
					conversation.lastPost !== null
						? {
								href: `${href}&pid=${conversation.lastPost.postId}#p${conversation.lastPost.postId}`,
								at: formatDate(input, conversation.lastPost.postedAt),
								by: conversation.lastPost.poster,
							}
						: null,
				selectLabel: lang.pms.selectConversation(conversation.subject),
			};
		}),
		pagination: paginationLinks(input.numPages, input.page, (page) => (page > 1 ? `pms_inbox.php?p=${page}` : 'pms_inbox.php')),
		notice: input.notice,
		errors: input.errors,
	};
}

// ——— Conversation ———

export interface ConversationView {
	menu: MenuItem[];
	heading: string;
	subject: string;
	pagination: PaginationLink[];
	replyUrl: string;
	posts: PostView[];
	quickPost: { formAction: string; bbcodeStatus: BbcodeStatus } | null;
	notice: string | null;
}

export interface ConversationInput extends DateContext {
	config: BoardConfig;
	conversation: PrivateConversation;
	messages: readonly PrivateMessageWithAuthor[];
	firstPosition: number;
	page: number;
	numPages: number;
	avatars: ReadonlyMap<number, string | null>;
	bannedUsernames: ReadonlySet<string>;
	censor: Censor | null;
	lang: Lang;
	notice: string | null;
}

function postActions(message: PrivateMessageWithAuthor, viewer: Viewer, lang: Lang): PostAction[] {
	const t = lang.pms;
	const ids = `mid=${message.id}&tid=${message.sharedId}`;
	const actions: PostAction[] = [];
	if (canEditPrivateMessage({ id: viewer.id, isModerator: isAnyModerator(viewer) }, message)) {
		actions.push({ kind: 'postdelete', href: `pms_view.php?action=delete&${ids}`, label: t.delete });
		actions.push({ kind: 'postedit', href: `pms_send.php?edit=${message.id}&tid=${message.sharedId}`, label: t.edit });
	}
	actions.push({ kind: 'postquote', href: `pms_send.php?reply=${message.sharedId}&quote=${message.id}`, label: t.quote });
	return actions;
}

export function buildConversation(input: ConversationInput): ConversationView {
	const { viewer, config, conversation, lang, censor } = input;
	const censored = (text: string): string => (censor !== null ? censor(text) : text);
	const viewerIsMod = isAnyModerator(viewer);
	const titleWords = { banned: lang.common.banned, guest: lang.common.guest, member: lang.common.member };
	const participants = participantLabels(conversation, viewer, lang)
		.map((participant) => participant.label)
		.join(', ');
	const subject = censored(conversation.subject);

	const posts = input.messages.map((message, index): PostView => {
		const author = message.author;
		const showInfo = author !== null && config.showUserInfo;
		const title = userTitle(
			author !== null
				? { username: message.sender, title: author.title, groupId: author.groupId, groupUserTitle: author.groupUserTitle }
				: { username: message.sender, title: '', groupId: GroupId.Guest, groupUserTitle: '' },
			input.bannedUsernames,
			titleWords,
		);
		return {
			id: message.id,
			number: input.firstPosition + index,
			isFirstPost: message.isHead,
			permalink: `pms_view.php?tid=${message.sharedId}&mid=${message.id}&pid=${message.id}#p${message.id}`,
			postedAt: formatDate(input, message.posted),
			username: message.sender,
			profileUrl: author !== null && viewer.group.canViewUsers ? `profile.php?id=${author.id}` : null,
			userTitle: censored(title),
			avatarUrl: author !== null && config.avatars && viewer.showAvatars ? (input.avatars.get(author.id) ?? null) : null,
			location: showInfo && author.location !== '' ? censored(author.location) : null,
			registeredAt: showInfo ? formatTime(author.registered, viewerTimeSettings(viewer), input.dateWords, input.now, true) : null,
			numPosts: showInfo && (config.showPostCount || viewerIsMod) ? author.numPosts : null,
			contacts: showInfo ? authorContactLinks(author, input) : [],
			ip: viewerIsMod ? { address: message.senderIp, href: `moderate.php?get_host=${message.senderIp}` } : null,
			adminNote: viewerIsMod && author !== null && author.adminNote !== '' ? author.adminNote : null,
			reputation: null,
			isOnline: author !== null ? author.isOnline : null,
			messageHtml: parseMessage(message.message, messageParserOptions(config, viewer, lang, censor, message.hideSmilies)),
			signatureHtml:
				config.signatures && viewer.showSignatures && author !== null && author.signature !== ''
					? parseSignature(author.signature, signatureParserOptions(config, viewer, lang, censor))
					: null,
			edited: null,
			actions: postActions(message, viewer, lang),
		};
	});

	const pageUrl = (page: number): string => `${conversationUrl(conversation)}${page > 1 ? `&p=${page}` : ''}`;
	return {
		menu: pmMenu('inbox', lang),
		heading: lang.pms.conversationTitle(subject, participants),
		subject,
		pagination: paginationLinks(input.numPages, input.page, pageUrl),
		replyUrl: `pms_send.php?reply=${conversation.sharedId}`,
		posts,
		quickPost: config.posting.quickpost
			? { formAction: `pms_send.php?reply=${conversation.sharedId}`, bbcodeStatus: bbcodeStatus(config, viewer, lang) }
			: null,
		notice: input.notice,
	};
}

// ——— Suppression ———

export interface DeleteConfirmationView {
	menu: MenuItem[];
	action: string;
	/** « Discussion démarrée par… » ou « Réponse de… », avec la date. */
	heading: string;
	isHead: boolean;
	canDeleteForEverybody: boolean;
	sender: string;
	postedAt: string;
	messageHtml: string;
	backUrl: string;
}

export function buildDeleteConfirmation(
	input: DateContext & {
		config: BoardConfig;
		message: PrivateMessage;
		canDeleteForEverybody: boolean;
		censor: Censor | null;
		lang: Lang;
	},
): DeleteConfirmationView {
	const { viewer, config, message, lang } = input;
	const postedAt = formatDate(input, message.posted);
	return {
		menu: pmMenu('inbox', lang),
		action: `pms_view.php?action=delete&mid=${message.id}&tid=${message.sharedId}`,
		heading: message.isHead ? lang.pms.topicBy(message.sender, postedAt) : lang.pms.replyBy(message.sender, postedAt),
		isHead: message.isHead,
		canDeleteForEverybody: input.canDeleteForEverybody,
		sender: message.sender,
		postedAt,
		messageHtml: parseMessage(message.message, messageParserOptions(config, viewer, lang, input.censor, message.hideSmilies)),
		backUrl: `${conversationUrl({ sharedId: message.sharedId, messageId: message.id })}&pid=${message.id}#p${message.id}`,
	};
}

// ——— Envoi ———

export interface SendFormView {
	menu: MenuItem[];
	heading: string;
	formAction: string;
	/** Destinataires et sujet saisis (nouvelle conversation) ; null pour une réponse ou une modification. */
	newConversation: { usernames: string; subject: string; maxReceivers: number; lists: { value: string; label: string }[] } | null;
	message: string;
	hideSmilies: boolean;
	showSmiliesOption: boolean;
	bbcodeStatus: BbcodeStatus;
	errors: string[];
	previewHtml: string | null;
}

export function buildSendForm(input: {
	viewer: Viewer;
	config: BoardConfig;
	lang: Lang;
	formAction: string;
	heading: string;
	newConversation: { usernames: string; subject: string; lists: readonly SendingList[] } | null;
	message: string;
	hideSmilies: boolean;
	errors: string[];
	preview: string | null;
	censor: Censor | null;
}): SendFormView {
	const { viewer, config, lang } = input;
	return {
		menu: pmMenu('send', lang),
		heading: input.heading,
		formAction: input.formAction,
		newConversation:
			input.newConversation !== null
				? {
						usernames: input.newConversation.usernames,
						subject: input.newConversation.subject,
						maxReceivers: config.privateMessageMaxReceivers - 1,
						lists: input.newConversation.lists.map((list) => ({
							value: list.members.map((member) => member.username).join(', '),
							label: list.name,
						})),
					}
				: null,
		message: input.message,
		hideSmilies: input.hideSmilies,
		showSmiliesOption: config.smilies,
		bbcodeStatus: bbcodeStatus(config, viewer, lang),
		errors: input.errors,
		previewHtml:
			input.preview !== null
				? parseMessage(input.preview, messageParserOptions(config, viewer, lang, input.censor, input.hideSmilies))
				: null,
	};
}

// ——— Contacts ———

export interface ContactRowView {
	id: number;
	name: { href: string | null; label: string };
	allowed: boolean;
	switchLabel: string;
	switchTitle: string;
	messageUrl: string;
	messageTitle: string;
	deleteTitle: string;
	selectLabel: string;
}

export function buildContacts(input: {
	viewer: Viewer;
	contacts: readonly PrivateContact[];
	lang: Lang;
	notice: string | null;
	errors: string[];
}) {
	const { viewer, lang } = input;
	const t = lang.pms;
	return {
		menu: pmMenu('contacts', lang),
		contacts: input.contacts.map(
			(contact): ContactRowView => ({
				id: contact.id,
				name: profileLink(viewer, contact.contactId, contact.name),
				allowed: contact.allowMessages,
				switchLabel: contact.allowMessages ? t.refuse : t.authorize,
				switchTitle: contact.allowMessages ? t.refuseFrom(contact.name) : t.authorizeFrom(contact.name),
				messageUrl: `pms_send.php?uid=${contact.contactId}`,
				messageTitle: t.quickMessageTo(contact.name),
				deleteTitle: t.deleteContact(contact.name),
				selectLabel: t.selectContact(contact.name),
			}),
		),
		notice: input.notice,
		errors: input.errors,
	};
}

// ——— Listes d'envoi ———

export function buildSendingLists(input: {
	viewer: Viewer;
	lists: readonly SendingList[];
	lang: Lang;
	form: { name: string; usernames: string };
	notice: string | null;
	errors: string[];
}) {
	const { viewer, lang } = input;
	return {
		menu: pmMenu('lists', lang),
		lists: input.lists.map((list) => ({
			id: list.id,
			name: list.name,
			members: list.members.map((member) => profileLink(viewer, member.id, member.username)),
			messageUrl: `pms_send.php?lid=${list.id}`,
			selectLabel: lang.pms.selectList(list.name),
		})),
		form: input.form,
		notice: input.notice,
		errors: input.errors,
	};
}
