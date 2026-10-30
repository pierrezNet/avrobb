/**
 * Écriture d'un message privé (pms_send.php) : nouvelle conversation (destinataires saisis, issus
 * d'un profil ?uid= ou d'une liste d'envoi ?lid=), réponse (?reply=, citation &quote=), modification
 * (?edit=), prévisualisation, et alertes par e-mail (new_pm.tpl, new_pm_full.tpl).
 *
 * Écarts assumés : on ne répond qu'à une conversation qu'on détient, et on ne modifie ou ne cite
 * qu'un message de sa propre boîte (le PHP ne vérifiait pas l'appartenance) ; le formulaire montre
 * le texte d'origine, non censuré (comme edit.php) ; après l'envoi d'une réponse ou d'une
 * modification, on revient au message dans la conversation.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Mailer } from '../adapters/mailer.ts';
import type { PrivateMessage, PrivateRecipient } from '../domain/models.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildSendForm, conversationUrl } from '../presenters/privateMessagesPage.ts';
import type { CensorReader } from '../repositories/CensorRepository.ts';
import type { SendingListStore } from '../repositories/PrivateContactRepository.ts';
import type { PrivateMessageStore, SentCopies } from '../repositories/PrivateMessageRepository.ts';
import { bbcodeToEmail } from '../services/bbcodeEmail.ts';
import { buildCensor } from '../services/censor.ts';
import type { MailTemplateReader } from '../services/mail.ts';
import { fillTemplate } from '../services/mail.ts';
import { isAnyModerator } from '../services/permissions.ts';
import { canEditPrivateMessage, parseUsernames, validateSend } from '../services/privateMessages.ts';
import { privateMessagesDenied } from './PrivateMessageController.ts';
import { positiveInt } from './params.ts';

export interface PrivateMessageSendControllerDeps extends LayoutDeps {
	privateMessageStore: PrivateMessageStore;
	sendingLists: SendingListStore;
	censorship: CensorReader;
	mailTemplates: MailTemplateReader;
	mailer: Mailer;
}

export interface PrivateMessageSendQuery {
	uid?: string;
	lid?: string;
	reply?: string;
	quote?: string;
	edit?: string;
	tid?: string;
}

type SendRequest = FastifyRequest<{ Querystring: PrivateMessageSendQuery; Body?: FormBody }>;

/** Ce qu'on écrit : nouvelle conversation, réponse à une conversation, ou modification. */
type Mode =
	| { kind: 'new' }
	| { kind: 'reply'; sharedId: number; subject: string; headId: number }
	| { kind: 'edit'; message: PrivateMessage };

interface FormState {
	usernames: string;
	subject: string;
	message: string;
	hideSmilies: boolean;
}

export class PrivateMessageSendController {
	constructor(private readonly deps: PrivateMessageSendControllerDeps) {}

	form = async (request: SendRequest, reply: FastifyReply): Promise<FastifyReply> => {
		const denied = privateMessagesDenied(request, reply, this.deps);
		if (denied !== null) return denied;
		const mode = await this.mode(request);
		if (mode === null) return renderMessage(request, reply, this.deps, 404, this.deps.page.lang.common.badRequest);

		const state: FormState = { usernames: '', subject: '', message: '', hideSmilies: false };
		if (mode.kind === 'edit') {
			state.message = mode.message.message;
			state.hideSmilies = mode.message.hideSmilies;
		} else if (mode.kind === 'reply') {
			const quoted = await this.ownMessage(request, positiveInt(request.query.quote));
			if (quoted !== null) state.message = `[quote=${quoted.sender}]${quoted.message}[/quote]\n`;
		} else {
			const usernames = await this.presetRecipients(request);
			if (usernames === null) return renderMessage(request, reply, this.deps, 404, this.deps.page.lang.common.badRequest);
			state.usernames = usernames.join(', ');
		}
		return this.render(request, reply, mode, state, [], null);
	};

	send = async (
		request: FastifyRequest<{ Querystring: PrivateMessageSendQuery; Body: FormBody }>,
		reply: FastifyReply,
	): Promise<FastifyReply> => {
		const denied = privateMessagesDenied(request, reply, this.deps);
		if (denied !== null) return denied;
		const { viewer, board: config, body } = request;
		const { lang } = this.deps.page;
		const store = this.deps.privateMessageStore;
		const mode = await this.mode(request);
		if (mode === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);

		const state: FormState = {
			usernames: field(body, 'p_username'),
			subject: field(body, 'req_subject'),
			message: field(body, 'req_message'),
			hideSmilies: body.hide_smilies !== undefined,
		};
		const preview = body.preview !== undefined;

		let recipients: PrivateRecipient[] = [];
		let usernames: string[] = [];
		if (mode.kind === 'new') {
			usernames = parseUsernames(state.usernames);
			recipients = await store.findRecipientsByName([...usernames, viewer.username], viewer.id);
		} else if (mode.kind === 'reply') {
			recipients = await store.findRecipientsById([...(await store.listHolders(mode.sharedId)), viewer.id], viewer.id);
			usernames = recipients.map((recipient) => recipient.username);
		}

		const result = validateSend(
			{ usernames, recipients, subject: mode.kind === 'new' ? state.subject : null, message: state.message, preview },
			{
				sender: {
					id: viewer.id,
					username: viewer.username,
					isModerator: isAnyModerator(viewer),
					privateMessageLimit: viewer.group.privateMessageLimit,
					privateMessageCount: viewer.privateMessageCount,
				},
				lastPost: viewer.lastPost,
				postFlood: viewer.group.postFlood,
				now: this.deps.page.clock(),
				maxReceivers: config.privateMessageMaxReceivers,
				editing: mode.kind === 'edit',
				bbcode: config.bbcode,
				subjectAllCaps: config.posting.subjectAllCaps,
				messageAllCaps: config.posting.messageAllCaps,
				preparse: {
					quoteDepth: config.posting.quoteDepth,
					makeLinks: config.posting.makeLinks,
					allowLinks: viewer.group.canPostLinks,
					indentSpaces: config.indentSpaces,
					baseUrl: config.baseUrl,
				},
			},
		);

		if (result.errors.length > 0 || preview) {
			const errors = result.errors.map((error) => lang.pms.sendError(error));
			return this.render(request, reply, mode, state, errors, errors.length === 0 ? result.message : null);
		}

		if (mode.kind === 'edit') {
			await store.editMessage(mode.message, result.message);
			return reply.redirect(
				`${conversationUrl({ sharedId: mode.message.sharedId, messageId: mode.message.id })}&pid=${mode.message.id}&done=edited#p${mode.message.id}`,
				303,
			);
		}

		const outgoing = {
			subject: mode.kind === 'new' ? result.subject : mode.subject,
			message: result.message,
			hideSmilies: state.hideSmilies,
			sender: { id: viewer.id, username: viewer.username, ip: request.ip },
			recipients: result.recipients,
			now: this.deps.page.clock(),
		};
		if (mode.kind === 'new') {
			const { sharedId, copies } = await store.createConversation(outgoing);
			await this.notify(request, result.recipients, sharedId, copies, result.message);
			return reply.redirect('pms_inbox.php?done=sent', 303);
		}
		const copies = await store.reply(mode.sharedId, outgoing);
		await this.notify(request, result.recipients, mode.sharedId, copies, result.message);
		const own = copies.get(viewer.id) ?? mode.headId;
		return reply.redirect(`pms_view.php?tid=${mode.sharedId}&mid=${mode.headId}&pid=${own}&done=sent#p${own}`, 303);
	};

	/** Mode d'après les paramètres (adresse, ou champs du formulaire envoyé), ou null si invalide. */
	private async mode(request: SendRequest): Promise<Mode | null> {
		const { query, body, viewer } = request;
		const store = this.deps.privateMessageStore;
		const editId = positiveInt(query.edit ?? field(body, 'edit'));
		if (editId > 0) {
			const message = await this.ownMessage(request, editId);
			return message !== null && canEditPrivateMessage({ id: viewer.id, isModerator: isAnyModerator(viewer) }, message)
				? { kind: 'edit', message }
				: null;
		}
		const replyId = positiveInt(query.reply ?? field(body, 'reply'));
		if (replyId > 0) {
			const conversation = await store.findConversation(replyId, viewer.id);
			return conversation !== null
				? { kind: 'reply', sharedId: replyId, subject: conversation.subject, headId: conversation.messageId }
				: null;
		}
		return { kind: 'new' };
	}

	private async ownMessage(request: FastifyRequest, messageId: number): Promise<PrivateMessage | null> {
		if (messageId <= 0) return null;
		const message = await this.deps.privateMessageStore.findMessage(messageId);
		return message !== null && message.ownerId === request.viewer.id ? message : null;
	}

	/** Destinataires proposés par un lien : membres ?uid=2-5, ou liste d'envoi ?lid=. Null si invalide. */
	private async presetRecipients(request: SendRequest): Promise<string[] | null> {
		const { query, viewer } = request;
		if (query.uid !== undefined) {
			const ids = query.uid
				.split('-')
				.map((id) => positiveInt(id))
				.filter((id) => id > 0);
			const found = await this.deps.privateMessageStore.findRecipientsById(ids, viewer.id);
			return found.length === new Set(ids).size ? ids.map((id) => found.find((r) => r.id === id)?.username ?? '') : null;
		}
		if (query.lid !== undefined) {
			const list = await this.deps.sendingLists.findSendingList(viewer.id, positiveInt(query.lid));
			return list !== null ? list.members.map((member) => member.username) : null;
		}
		return [];
	}

	/** Alertes par e-mail (o_pms_notification), sauf à l'expéditeur. */
	private async notify(
		request: FastifyRequest,
		recipients: readonly PrivateRecipient[],
		sharedId: number,
		copies: SentCopies,
		message: string,
	): Promise<void> {
		const { viewer, board: config } = request;
		if (!config.privateMessageNotification) return;
		const targets = recipients.filter((recipient) => recipient.id !== viewer.id && recipient.notifyPrivateMessages);
		if (targets.length === 0) return;

		const [short, full] = await Promise.all([this.deps.mailTemplates.load('new_pm'), this.deps.mailTemplates.load('new_pm_full')]);
		for (const recipient of targets) {
			const template = recipient.notifyPrivateMessagesFull ? full : short;
			const values = {
				board_title: config.boardTitle,
				sender: viewer.username,
				message: bbcodeToEmail(message, config.baseUrl, config.indentSpaces),
				pm_url: `${config.baseUrl}/pms_view.php?tid=${sharedId}&mid=${copies.get(recipient.id) ?? 0}&box=inbox`,
				board_mailer: config.boardTitle,
			};
			await this.deps.mailer.send(
				{ to: recipient.email, subject: fillTemplate(template.subject, values), text: fillTemplate(template.body, values) },
				config,
			);
		}
	}

	private async render(
		request: SendRequest,
		reply: FastifyReply,
		mode: Mode,
		state: FormState,
		errors: string[],
		preview: string | null,
	): Promise<FastifyReply> {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		const formAction =
			mode.kind === 'edit'
				? `pms_send.php?edit=${mode.message.id}&tid=${mode.message.sharedId}`
				: mode.kind === 'reply'
					? `pms_send.php?reply=${mode.sharedId}`
					: 'pms_send.php';
		const heading =
			mode.kind === 'new' ? lang.pms.sendAMessage : mode.kind === 'reply' ? `${lang.pms.reply} : ${mode.subject}` : lang.pms.edit;
		const view = buildSendForm({
			viewer,
			config,
			lang,
			formAction,
			heading,
			newConversation:
				mode.kind === 'new'
					? { usernames: state.usernames, subject: state.subject, lists: await this.deps.sendingLists.listSendingLists(viewer.id) }
					: null,
			message: state.message,
			hideSmilies: state.hideSmilies,
			errors,
			preview,
			censor: config.censoring ? buildCensor(await this.deps.censorship.listWords()) : null,
		});
		return renderPage(
			request,
			reply,
			this.deps,
			'pms_send.njk',
			{ pageId: 'pms_send', titleParts: [config.boardTitle, lang.pms.pmTitle, lang.pms.sendAMessage], activeNav: 'pm' },
			view,
		);
	}
}
