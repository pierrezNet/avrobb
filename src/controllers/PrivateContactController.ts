/**
 * Carnet d'adresses (pms_contacts.php) et listes d'envoi (pms_sending_lists.php) de la messagerie
 * privée (mod APMS).
 *
 * Écarts assumés : ajout, suppression et changement de droits d'un contact en POST (le PHP les
 * faisait par des liens GET ; ces anciens liens, comme « Ajouter aux contacts » du profil, mènent
 * à une confirmation) ; une liste d'envoi aux destinataires invalides est refusée (le PHP
 * l'enregistrait malgré ses erreurs) et doit porter un nom.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildContacts, buildSendingLists } from '../presenters/privateMessagesPage.ts';
import type { PrivateContactStore, SendingListStore } from '../repositories/PrivateContactRepository.ts';
import type { PrivateMessageStore } from '../repositories/PrivateMessageRepository.ts';
import { punTrim } from '../services/phpString.ts';
import { parseUsernames } from '../services/privateMessages.ts';
import { idList, privateMessagesDenied } from './PrivateMessageController.ts';
import { positiveInt } from './params.ts';

export interface PrivateContactControllerDeps extends LayoutDeps {
	privateContacts: PrivateContactStore;
	sendingLists: SendingListStore;
	privateMessageStore: PrivateMessageStore;
}

export interface PrivateContactQuery {
	add?: string;
	delete?: string;
	switch?: string;
	done?: string;
}

type ContactRequest = FastifyRequest<{ Querystring: PrivateContactQuery; Body?: FormBody }>;
type ContactPost = FastifyRequest<{ Querystring: PrivateContactQuery; Body: FormBody }>;

export class PrivateContactController {
	constructor(private readonly deps: PrivateContactControllerDeps) {}

	// ——— Contacts ———

	contacts = async (request: ContactRequest, reply: FastifyReply, errors: string[] = []): Promise<FastifyReply> => {
		const denied = privateMessagesDenied(request, reply, this.deps);
		if (denied !== null) return denied;
		const { query, viewer } = request;
		const { lang } = this.deps.page;
		const t = lang.pms;

		// Anciens liens GET du PHP : confirmation avant d'écrire.
		const addId = positiveInt(query.add);
		if (addId > 0) {
			const candidate = await this.deps.privateContacts.findCandidate(viewer.id, { id: addId });
			if (candidate === null) return renderMessage(request, reply, this.deps, 404, t.userNotExists);
			return this.confirm(request, reply, t.addContact, t.confirmAddContact(candidate.username), t.add, [
				{ name: 'add', value: String(addId) },
			]);
		}
		const contact = await this.ownContact(request, positiveInt(query.delete ?? query.switch));
		if (query.delete !== undefined || query.switch !== undefined) {
			if (contact === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
			return query.delete !== undefined
				? this.confirm(request, reply, t.deleteContact(contact.name), t.confirmDeleteContact, t.delete, [
						{ name: 'delete', value: String(contact.id) },
					])
				: this.confirm(
						request,
						reply,
						t.rightsContact,
						t.confirmSwitchContact(contact.name),
						contact.allowMessages ? t.refuse : t.authorize,
						[{ name: 'switch', value: String(contact.id) }],
					);
		}

		const notices: Record<string, string> = {
			added: t.contactAdded,
			status: t.contactStatusChanged,
			statuses: t.contactsStatusChanged,
			deleted: t.contactsDeleted,
		};
		const view = buildContacts({
			viewer,
			contacts: await this.deps.privateContacts.listContacts(viewer.id),
			lang,
			notice: notices[query.done ?? ''] ?? null,
			errors,
		});
		return renderPage(
			request,
			reply,
			this.deps,
			'pms_contacts.njk',
			{ pageId: 'pms_contacts', titleParts: [request.board.boardTitle, t.pmTitle, t.contacts], activeNav: 'pm' },
			view,
		);
	};

	updateContacts = async (request: ContactPost, reply: FastifyReply): Promise<FastifyReply> => {
		const denied = privateMessagesDenied(request, reply, this.deps);
		if (denied !== null) return denied;
		const { viewer, body } = request;
		const { lang } = this.deps.page;
		const t = lang.pms;
		const store = this.deps.privateContacts;

		if (body.add !== undefined) return this.addContact(request, reply);
		if (body.delete !== undefined || body.switch !== undefined) {
			const contact = await this.ownContact(request, positiveInt(field(body, 'delete') || field(body, 'switch')));
			if (contact === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
			if (body.delete !== undefined) await store.deleteContacts(viewer.id, [contact.id]);
			else await store.toggleAllowed(viewer.id, contact.id);
			return reply.redirect(`pms_contacts.php?done=${body.delete !== undefined ? 'deleted' : 'status'}`, 303);
		}

		const action = field(body, 'action');
		if (action === 'delete_multiple' && field(body, 'delete_multiple_comply') !== '') {
			await store.deleteContacts(viewer.id, idList(body, 'contacts'));
			return reply.redirect('pms_contacts.php?done=deleted', 303);
		}
		const selected = idList(body, 'selected');
		if (selected.length === 0) return this.contacts(request, reply, [t.mustSelectContacts]);

		switch (action) {
			case 'send': {
				const userIds = await store.listContactUserIds(viewer.id, selected);
				if (userIds.length === 0) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
				return reply.redirect(`pms_send.php?uid=${userIds.join('-')}`, 303);
			}
			case 'authorize':
			case 'refuse':
				await store.setAllowed(viewer.id, selected, action === 'authorize');
				return reply.redirect('pms_contacts.php?done=statuses', 303);
			case 'delete_multiple':
				return this.confirm(request, reply, t.multideleteContacts, t.deleteContactsComply, t.delete, [
					{ name: 'action', value: 'delete_multiple' },
					{ name: 'contacts', value: selected.join(',') },
					{ name: 'delete_multiple_comply', value: '1' },
				]);
			default:
				return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
		}
	};

	/** Ajout par le formulaire (pseudo, refus éventuel) ou depuis un profil (identifiant, autorisé). */
	private async addContact(request: ContactPost, reply: FastifyReply): Promise<FastifyReply> {
		const { viewer, body } = request;
		const t = this.deps.page.lang.pms;
		const byName = body.req_username !== undefined;
		const target = byName ? { username: punTrim(field(body, 'req_username')) } : { id: positiveInt(field(body, 'add')) };
		const candidate = await this.deps.privateContacts.findCandidate(viewer.id, target);

		const error =
			candidate === null || candidate.id === viewer.id
				? t.userNotExists
				: candidate.alreadyContact
					? t.userAlreadyContact
					: !candidate.groupCanUsePrivateMessages
						? t.userCannotUse
						: null;
		if (error !== null || candidate === null) return this.contacts(request, reply, [error ?? t.userNotExists]);

		await this.deps.privateContacts.addContact(viewer.id, candidate, !(byName && body.req_refuse !== undefined));
		return reply.redirect(byName ? 'pms_contacts.php?done=added' : `profile.php?id=${candidate.id}`, 303);
	}

	private async ownContact(request: FastifyRequest, contactId: number) {
		if (contactId <= 0) return null;
		const contacts = await this.deps.privateContacts.listContacts(request.viewer.id);
		return contacts.find((contact) => contact.id === contactId) ?? null;
	}

	// ——— Listes d'envoi ———

	sendingLists = async (
		request: ContactRequest,
		reply: FastifyReply,
		errors: string[] = [],
		form = { name: '', usernames: '' },
	): Promise<FastifyReply> => {
		const denied = privateMessagesDenied(request, reply, this.deps);
		if (denied !== null) return denied;
		const { query, viewer } = request;
		const { lang } = this.deps.page;
		const t = lang.pms;

		if (query.delete !== undefined) {
			const list = await this.deps.sendingLists.findSendingList(viewer.id, positiveInt(query.delete));
			if (list === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
			return this.confirm(
				request,
				reply,
				t.deleteThisList,
				t.confirmDeleteList,
				t.delete,
				[{ name: 'delete', value: String(list.id) }],
				'pms_sending_lists.php',
			);
		}

		const notices: Record<string, string> = { added: t.listAdded, deleted: t.listsDeleted };
		const view = buildSendingLists({
			viewer,
			lists: await this.deps.sendingLists.listSendingLists(viewer.id),
			lang,
			form,
			notice: notices[query.done ?? ''] ?? null,
			errors,
		});
		return renderPage(
			request,
			reply,
			this.deps,
			'pms_sending_lists.njk',
			{ pageId: 'pms_sending_lists', titleParts: [request.board.boardTitle, t.pmTitle, t.sendingLists], activeNav: 'pm' },
			view,
		);
	};

	updateSendingLists = async (request: ContactPost, reply: FastifyReply): Promise<FastifyReply> => {
		const denied = privateMessagesDenied(request, reply, this.deps);
		if (denied !== null) return denied;
		const { viewer, body } = request;
		const { lang } = this.deps.page;
		const t = lang.pms;
		const store = this.deps.sendingLists;

		if (body.form_sent !== undefined) return this.addSendingList(request, reply);
		if (body.delete !== undefined) {
			const deleted = await store.deleteSendingLists(viewer.id, [positiveInt(field(body, 'delete'))]);
			if (deleted === 0) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
			return reply.redirect('pms_sending_lists.php?done=deleted', 303);
		}
		if (field(body, 'action') !== 'delete_multiple') return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
		if (field(body, 'delete_multiple_comply') !== '') {
			await store.deleteSendingLists(viewer.id, idList(body, 'lists'));
			return reply.redirect('pms_sending_lists.php?done=deleted', 303);
		}
		const selected = idList(body, 'selected');
		if (selected.length === 0) return this.sendingLists(request, reply, [t.mustSelectLists]);
		return this.confirm(
			request,
			reply,
			t.multideleteLists,
			t.deleteListsComply,
			t.delete,
			[
				{ name: 'action', value: 'delete_multiple' },
				{ name: 'lists', value: selected.join(',') },
				{ name: 'delete_multiple_comply', value: '1' },
			],
			'pms_sending_lists.php',
		);
	};

	private async addSendingList(request: ContactPost, reply: FastifyReply): Promise<FastifyReply> {
		const { viewer, body, board: config } = request;
		const t = this.deps.page.lang.pms;
		const form = { name: punTrim(field(body, 'list_name')), usernames: field(body, 'req_username') };
		const usernames = parseUsernames(form.usernames);
		const lower = (name: string): string => name.toLowerCase();

		const errors: string[] = [];
		if (form.name === '') errors.push(t.noListName);
		if (usernames.some((name) => lower(name) === lower(viewer.username))) errors.push(t.yourself);
		if (usernames.length === 0) errors.push(t.sendError({ kind: 'noReceiver' }));
		else if (usernames.length > config.privateMessageMaxReceivers)
			errors.push(t.sendError({ kind: 'tooManyReceivers', max: config.privateMessageMaxReceivers - 1 }));

		const found = await this.deps.privateMessageStore.findRecipientsByName(usernames, viewer.id);
		const members: { id: number; username: string }[] = [];
		for (const username of usernames) {
			const recipient = found.find((candidate) => lower(candidate.username) === lower(username));
			if (recipient === undefined) errors.push(t.sendError({ kind: 'noUser', username }));
			else if (!recipient.usesPrivateMessages) errors.push(t.sendError({ kind: 'userDisabled', username }));
			else if (recipient.id !== viewer.id) members.push({ id: recipient.id, username: recipient.username });
		}
		if (errors.length > 0) return this.sendingLists(request, reply, errors, form);

		await this.deps.sendingLists.createSendingList(viewer.id, form.name, members);
		return reply.redirect('pms_sending_lists.php?done=added', 303);
	}

	private confirm(
		request: FastifyRequest,
		reply: FastifyReply,
		title: string,
		text: string,
		button: string,
		hidden: { name: string; value: string }[],
		action = 'pms_contacts.php',
	): Promise<FastifyReply> {
		const { lang } = this.deps.page;
		return renderPage(
			request,
			reply,
			this.deps,
			'confirm.njk',
			{ pageId: action.replace('.php', ''), titleParts: [request.board.boardTitle, lang.pms.pmTitle, title], activeNav: 'pm' },
			{ title, text, action, button, hidden },
		);
	}
}
