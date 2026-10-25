/**
 * Messagerie privée (mod APMS) : boîte de réception (pms_inbox.php) et conversation, avec la
 * suppression d'un message (pms_view.php).
 *
 * Écarts assumés : actions et suppressions en POST avec jeton CSRF ; un message ne se supprime que
 * dans un exemplaire qu'on détient, « pour tous » réservé aux modérateurs (le PHP laissait un
 * modérateur supprimer n'importe quel message par son numéro, et sa suppression « pour tous »
 * cherchait les messages au texte identique dans toute la base) ; quitter une conversation retire
 * tous ses messages de sa boîte (le PHP ne retirait que la première ligne).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FormBody } from '../http/forms.ts';
import { field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildConversation, buildDeleteConfirmation, buildInbox } from '../presenters/privateMessagesPage.ts';
import type { BanReader } from '../repositories/BanRepository.ts';
import type { CensorReader } from '../repositories/CensorRepository.ts';
import type { PrivateMessageStore } from '../repositories/PrivateMessageRepository.ts';
import type { AvatarLocator } from '../services/avatars.ts';
import { buildCensor } from '../services/censor.ts';
import { pageCount } from '../services/pagination.ts';
import { canUsePrivateMessages, isAnyModerator } from '../services/permissions.ts';
import { canDeleteForEverybody } from '../services/privateMessages.ts';
import { positiveInt } from './params.ts';

export interface PrivateMessageControllerDeps extends LayoutDeps {
	privateMessageStore: PrivateMessageStore;
	bans: BanReader;
	censorship: CensorReader;
	avatars: AvatarLocator;
}

export interface PrivateMessageQuery {
	p?: string;
	tid?: string;
	mid?: string;
	pid?: string;
	action?: string;
	done?: string;
}

type PmRequest = FastifyRequest<{ Querystring: PrivateMessageQuery; Body?: FormBody }>;

/** Identifiants entiers positifs d'un champ répété (cases à cocher) ou d'une liste « 1,2,3 ». */
export function idList(body: FormBody | undefined, name: string): number[] {
	const raw = body?.[name];
	const values = raw === undefined ? [] : Array.isArray(raw) ? raw : raw.split(',');
	return [...new Set(values.map((value) => positiveInt(value.trim())).filter((id) => id > 0))];
}

/** Accès à la messagerie : membre, messagerie activée pour le forum, son groupe et lui-même. */
export function privateMessagesDenied(request: FastifyRequest, reply: FastifyReply, deps: LayoutDeps): Promise<FastifyReply> | null {
	return canUsePrivateMessages(request.viewer, request.board)
		? null
		: renderMessage(request, reply, deps, 403, deps.page.lang.common.noPermission);
}

export class PrivateMessageController {
	constructor(private readonly deps: PrivateMessageControllerDeps) {}

	inbox = async (request: PmRequest, reply: FastifyReply, errors: string[] = []): Promise<FastifyReply> => {
		const denied = privateMessagesDenied(request, reply, this.deps);
		if (denied !== null) return denied;
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;

		const perPage = config.privateMessagesPerPage;
		const numPages = pageCount(await this.deps.privateMessageStore.countConversations(viewer.id), perPage);
		const requested = positiveInt(request.query.p);
		// Page hors limites : première page, comme le PHP.
		const page = requested >= 1 && requested <= numPages ? requested : 1;
		const conversations = await this.deps.privateMessageStore.listConversations(viewer.id, (page - 1) * perPage, perPage);

		const notices: Record<string, string> = {
			read: lang.pms.readDone,
			unread: lang.pms.unreadDone,
			deleted: lang.pms.deletedDone,
			sent: lang.pms.sent,
		};
		const view = buildInbox({
			viewer,
			conversations,
			page,
			numPages,
			lang,
			dateWords: this.deps.page.dateWords,
			now: this.deps.page.clock(),
			notice: notices[request.query.done ?? ''] ?? null,
			errors,
		});
		return renderPage(
			request,
			reply,
			this.deps,
			'pms_inbox.njk',
			{
				pageId: 'pms_inbox',
				titleParts: [config.boardTitle, lang.pms.pmTitle, lang.pms.inbox],
				activeNav: 'pm',
				pageNumber: page > 1 ? page : null,
			},
			view,
		);
	};

	/** Actions de la boîte : marquer lus ou non lus, supprimer (après confirmation). */
	inboxAction = async (
		request: FastifyRequest<{ Querystring: PrivateMessageQuery; Body: FormBody }>,
		reply: FastifyReply,
	): Promise<FastifyReply> => {
		const denied = privateMessagesDenied(request, reply, this.deps);
		if (denied !== null) return denied;
		const { viewer, body } = request;
		const { lang } = this.deps.page;
		const store = this.deps.privateMessageStore;
		const action = field(body, 'action');

		if (action === 'delete_multiple' && field(body, 'delete_multiple_comply') !== '') {
			await store.leaveConversations(viewer, idList(body, 'messages'));
			return reply.redirect('pms_inbox.php?done=deleted', 303);
		}

		const selected = idList(body, 'selected');
		if (selected.length === 0) return this.inbox(request, reply, [lang.pms.mustSelect]);

		if (action === 'markread' || action === 'markunread') {
			await store.setConversationsRead(viewer.id, selected, action === 'markread');
			return reply.redirect(`pms_inbox.php?done=${action === 'markread' ? 'read' : 'unread'}`, 303);
		}
		if (action === 'delete_multiple')
			return renderPage(
				request,
				reply,
				this.deps,
				'confirm.njk',
				{ pageId: 'pms_inbox', titleParts: [request.board.boardTitle, lang.pms.multidelete, lang.pms.pmTitle], activeNav: 'pm' },
				{
					title: lang.pms.multidelete,
					text: lang.pms.deleteMessagesComply,
					action: 'pms_inbox.php',
					button: lang.pms.delete,
					hidden: [
						{ name: 'action', value: 'delete_multiple' },
						{ name: 'messages', value: selected.join(',') },
						{ name: 'delete_multiple_comply', value: '1' },
					],
				},
			);
		return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
	};

	view = async (request: PmRequest, reply: FastifyReply): Promise<FastifyReply> => {
		const denied = privateMessagesDenied(request, reply, this.deps);
		if (denied !== null) return denied;
		if (request.query.action === 'delete') return this.confirmDelete(request, reply);

		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		const store = this.deps.privateMessageStore;
		const sharedId = positiveInt(request.query.tid);
		const conversation = sharedId > 0 && positiveInt(request.query.mid) > 0 ? await store.findConversation(sharedId, viewer.id) : null;
		if (conversation === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);

		const perPage = viewer.postsPerPage ?? config.defaultPostsPerPage;
		const numPages = pageCount(await store.countMessages(sharedId, viewer.id), perPage);
		const pid = positiveInt(request.query.pid);
		const position = pid > 0 ? await store.messagePosition(pid, sharedId, viewer.id) : null;
		const requested = position !== null ? Math.ceil(position / perPage) : positiveInt(request.query.p);
		const page = Math.min(Math.max(requested, 1), numPages);

		const messages = await store.listMessages(sharedId, viewer.id, (page - 1) * perPage, perPage);
		if (conversation.unread) await store.markConversationRead(sharedId, viewer.id);

		const authorIds = [...new Set(messages.flatMap((message) => (message.author !== null ? [message.author.id] : [])))];
		const [bannedUsernames, censoredWords, avatarUrls] = await Promise.all([
			this.deps.bans.listBannedUsernames(),
			config.censoring ? this.deps.censorship.listWords() : [],
			config.avatars && viewer.showAvatars ? Promise.all(authorIds.map((id) => this.deps.avatars.urlFor(id, config.avatarsDir))) : [],
		]);

		const view = buildConversation({
			viewer,
			config,
			conversation,
			messages,
			firstPosition: (page - 1) * perPage + 1,
			page,
			numPages,
			avatars: new Map(authorIds.map((id, index) => [id, avatarUrls[index] ?? null])),
			bannedUsernames,
			censor: config.censoring ? buildCensor(censoredWords) : null,
			lang,
			dateWords: this.deps.page.dateWords,
			now: this.deps.page.clock(),
			notice: request.query.done === 'edited' ? lang.pms.edited : request.query.done === 'sent' ? lang.pms.sent : null,
		});
		return renderPage(
			request,
			reply,
			this.deps,
			'pms_view.njk',
			{
				pageId: 'pms_view',
				titleParts: [config.boardTitle, lang.pms.pmTitle, lang.pms.view],
				activeNav: 'pm',
				pageNumber: page > 1 ? page : null,
			},
			view,
		);
	};

	/** Message de sa propre boîte, désigné par mid. */
	private async ownMessage(request: PmRequest) {
		const mid = positiveInt(request.query.mid ?? field(request.body, 'mid'));
		const message = mid > 0 ? await this.deps.privateMessageStore.findMessage(mid) : null;
		return message !== null && message.ownerId === request.viewer.id ? message : null;
	}

	private async confirmDelete(request: PmRequest, reply: FastifyReply): Promise<FastifyReply> {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		const message = await this.ownMessage(request);
		if (message === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);

		const view = buildDeleteConfirmation({
			viewer,
			config,
			message,
			canDeleteForEverybody: canDeleteForEverybody({ isModerator: isAnyModerator(viewer) }),
			censor: config.censoring ? buildCensor(await this.deps.censorship.listWords()) : null,
			lang,
			dateWords: this.deps.page.dateWords,
			now: this.deps.page.clock(),
		});
		return renderPage(
			request,
			reply,
			this.deps,
			'pms_delete.njk',
			{ pageId: 'pms_view', titleParts: [config.boardTitle, lang.pms.deleteMessage], activeNav: 'pm' },
			view,
		);
	}

	delete = async (
		request: FastifyRequest<{ Querystring: PrivateMessageQuery; Body: FormBody }>,
		reply: FastifyReply,
	): Promise<FastifyReply> => {
		const denied = privateMessagesDenied(request, reply, this.deps);
		if (denied !== null) return denied;
		const { viewer, body } = request;
		const store = this.deps.privateMessageStore;
		const message = await this.ownMessage(request);
		if (message === null) return renderMessage(request, reply, this.deps, 404, this.deps.page.lang.common.badRequest);

		const everybody = field(body, 'delete_all') !== '' && canDeleteForEverybody({ isModerator: isAnyModerator(viewer) });
		if (everybody) await store.deleteForEverybody(message);
		else if (message.isHead) await store.leaveConversations(viewer, [message.sharedId]);
		else await store.deleteCopy(message.id, viewer.id);
		return reply.redirect('pms_inbox.php?done=deleted', 303);
	};
}
