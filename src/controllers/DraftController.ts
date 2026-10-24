/**
 * Contrôleur des brouillons de PV : draft_list.php (liste, brouillon ouvert, suppression confirmée
 * en POST) et draft_edit.php (modification). Réservé aux membres ; chacun ne voit que les siens.
 *
 * Écart assumé : la modification d'un brouillon suit les mêmes contrôles que post.php (draft_edit.php
 * mettait un texte tout en capitales en minuscules et limitait le message à 64 Kio).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { BoardConfig, Draft } from '../domain/models.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildDraftEditPage, buildDraftList } from '../presenters/draftPage.ts';
import type { BanReader } from '../repositories/BanRepository.ts';
import type { CensorReader } from '../repositories/CensorRepository.ts';
import type { DraftStore } from '../repositories/DraftRepository.ts';
import type { ToolbarReader } from '../repositories/ToolbarRepository.ts';
import { buildCensor, type Censor } from '../services/censor.ts';
import { isAnyModerator } from '../services/permissions.ts';
import { validatePost } from '../services/posting.ts';
import { DEFAULT_TOOLBAR } from '../services/toolbar.ts';
import { positiveInt } from './params.ts';

export interface DraftControllerDeps extends LayoutDeps {
	drafts: DraftStore;
	bans: BanReader;
	censorship: CensorReader;
	toolbar: ToolbarReader;
}

export interface DraftQuery {
	id?: string;
	action?: string;
}

type DraftRequest = FastifyRequest<{ Querystring: DraftQuery; Body?: FormBody }>;

export class DraftController {
	constructor(private readonly deps: DraftControllerDeps) {}

	list = async (request: FastifyRequest<{ Querystring: DraftQuery }>, reply: FastifyReply): Promise<FastifyReply> => {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		if (viewer.isGuest) return reply.redirect('login.php');

		const id = positiveInt(request.query.id);
		const drafts = await this.deps.drafts.listByPoster(viewer.id);
		let opened: Draft | null = null;
		if (id > 0) {
			opened = await this.deps.drafts.find(id);
			if (opened === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
			if (opened.posterId !== viewer.id) return renderMessage(request, reply, this.deps, 403, lang.common.noPermission);
		}

		const view = buildDraftList({
			viewer,
			config,
			drafts,
			opened,
			confirmDelete: request.query.action === 'delete',
			censor: await this.censor(config),
			lang,
			dateWords: this.deps.page.dateWords,
			now: this.deps.page.clock(),
		});
		return renderPage(
			request,
			reply,
			this.deps,
			'draft_list.njk',
			{ pageId: 'draft_list', titleParts: [lang.drafts.title, config.boardTitle] },
			view,
		);
	};

	/** Suppression confirmée (formulaire de draft_list.php?action=delete). */
	remove = async (request: FastifyRequest<{ Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> => {
		const { viewer } = request;
		if (viewer.isGuest) return reply.redirect('login.php');
		const id = positiveInt(field(request.body, 'id'));
		if (field(request.body, 'action') === 'delete' && field(request.body, 'delete_comply') !== '' && id > 0)
			// Comme le PHP : la requête ne touche que les brouillons du membre.
			await this.deps.drafts.delete(id, viewer.id);
		return reply.redirect('draft_list.php');
	};

	edit = async (request: FastifyRequest<{ Querystring: DraftQuery }>, reply: FastifyReply): Promise<FastifyReply> => {
		const draft = await this.resolveDraft(request, reply);
		if (!('posterId' in draft)) return draft;
		return this.renderForm(request, reply, draft, { subject: draft.subject, message: draft.message }, [], null);
	};

	save = async (request: FastifyRequest<{ Querystring: DraftQuery; Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> => {
		const draft = await this.resolveDraft(request, reply);
		if (!('posterId' in draft)) return draft;
		const { viewer, board: config, body } = request;
		const { lang } = this.deps.page;
		const isNewTopic = draft.topicId === null;
		const preview = body.preview !== undefined;

		const result = validatePost(
			{
				subject: isNewTopic ? field(body, 'req_subject') : null,
				message: field(body, 'req_message'),
				username: '',
				email: '',
				hideSmilies: false,
				subscribe: false,
				stickTopic: false,
				preview,
			},
			{
				viewer,
				now: this.deps.page.clock(),
				isAnyModerator: isAnyModerator(viewer),
				isForumModerator: false,
				config: {
					bbcode: config.bbcode,
					subjectAllCaps: config.posting.subjectAllCaps,
					messageAllCaps: config.posting.messageAllCaps,
					forceGuestEmail: false,
					allowBannedEmail: true,
				},
				preparse: {
					quoteDepth: config.posting.quoteDepth,
					makeLinks: config.posting.makeLinks,
					indentSpaces: config.indentSpaces,
					baseUrl: config.baseUrl,
				},
				censor: await this.censor(config),
				bans: await this.deps.bans.listBans(),
				similarUsername: null,
				guestLabel: lang.common.guest,
				checkFlood: false,
			},
		);

		if (result.errors.length > 0 || preview) {
			const errors = result.errors.map((error) => lang.post.postError(error));
			return this.renderForm(
				request,
				reply,
				draft,
				{ subject: field(body, 'req_subject'), message: result.originalMessage },
				errors,
				errors.length === 0 ? result.message : null,
			);
		}

		await this.deps.drafts.update(draft.id, { subject: isNewTopic ? result.subject : null, message: result.message });
		return reply.redirect(`draft_list.php?id=${draft.id}`);
	};

	private async resolveDraft(request: DraftRequest, reply: FastifyReply): Promise<Draft | FastifyReply> {
		const { viewer } = request;
		const { lang } = this.deps.page;
		if (viewer.isGuest) return reply.redirect('login.php');
		const id = positiveInt(request.query.id);
		const draft = id > 0 ? await this.deps.drafts.find(id) : null;
		if (draft === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
		if (draft.posterId !== viewer.id) return renderMessage(request, reply, this.deps, 403, lang.common.noPermission);
		return draft;
	}

	private async censor(config: BoardConfig): Promise<Censor | null> {
		return config.censoring ? buildCensor(await this.deps.censorship.listWords()) : null;
	}

	private async renderForm(
		request: DraftRequest,
		reply: FastifyReply,
		draft: Draft,
		form: { subject: string; message: string },
		errors: string[],
		preview: string | null,
	): Promise<FastifyReply> {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		const view = buildDraftEditPage({
			viewer,
			config,
			draft,
			form,
			errors,
			preview,
			toolbar: (await this.deps.toolbar.load()) ?? DEFAULT_TOOLBAR,
			censor: await this.censor(config),
			lang,
		});
		return renderPage(request, reply, this.deps, 'post.njk', { pageId: 'draft_edit', titleParts: [config.boardTitle, view.heading] }, view);
	}
}
