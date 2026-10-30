/**
 * Pages d'information (admin_pages.php, page propre à AvroBB, administrateurs) : liste des pages du
 * pied de page, modification de leur texte et retour au texte par défaut. Le contenu est enregistré
 * dans la table config (services/staticPageConfig.ts).
 */

import type { StaticPageId } from '../domain/models.ts';
import type { AppReply, AppRequest } from '../http/context.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage } from '../http/layout.ts';
import { staticPageContent } from '../presenters/staticPage.ts';
import type { ConfigCache } from '../repositories/ConfigLoader.ts';
import type { ConfigStore } from '../repositories/ConfigRepository.ts';
import {
	formatStaticBody,
	isStaticPageId,
	readStaticPageForm,
	STATIC_PAGE_IDS,
	serializeStaticPage,
	staticPageKey,
} from '../services/staticPageConfig.ts';
import { adminDenied, renderAdminPage } from './adminPage.ts';

export interface AdminPagesControllerDeps extends LayoutDeps {
	configStore: ConfigStore;
	configCache: ConfigCache;
}

export interface AdminPagesQuery {
	page?: string;
	done?: string;
}

interface PageForm {
	title: string;
	intro: string;
	body: string;
}

export class AdminPagesController {
	constructor(private readonly deps: AdminPagesControllerDeps) {}

	show = async (request: AppRequest<{ Querystring: AdminPagesQuery }>, reply: AppReply): Promise<AppReply> => {
		const denied = adminDenied(request, reply, this.deps, true);
		if (denied !== null) return denied;
		const t = this.deps.page.lang.adminPages;
		const notices: Record<string, string> = { saved: t.saved, reset: t.resetDone };
		const notice = notices[request.query.done ?? ''] ?? null;
		const id = request.query.page ?? '';
		if (id === '') return this.#list(request, reply, notice);
		if (!isStaticPageId(id)) return renderMessage(request, reply, this.deps, 404, this.deps.page.lang.common.badRequest);
		const page = staticPageContent(id, request.board.staticPages[id], this.deps.page.lang);
		return this.#form(request, reply, id, { title: page.title, intro: page.intro, body: formatStaticBody(page.sections) }, [], notice);
	};

	submit = async (request: AppRequest<{ Body: FormBody }>, reply: AppReply): Promise<AppReply> => {
		const denied = adminDenied(request, reply, this.deps, true);
		if (denied !== null) return denied;
		const id = field(request.body, 'page');
		if (!isStaticPageId(id)) return renderMessage(request, reply, this.deps, 400, this.deps.page.lang.common.badRequest);

		if (field(request.body, 'reset') !== '') {
			await this.deps.configStore.deleteValues([staticPageKey(id)]);
			await this.deps.configCache.invalidate();
			return reply.redirect(`admin_pages.php?page=${id}&done=reset`, 303);
		}

		const result = readStaticPageForm((name) => field(request.body, name));
		if (result.kind === 'error') {
			const t = this.deps.page.lang.adminPages;
			const errors = result.errors.map((error) => t.errors[error] ?? error);
			reply.code(400);
			return this.#form(request, reply, id, result, errors, null);
		}
		// Clé propre à AvroBB, absente tant que la page n'a pas été modifiée : REPLACE.
		const value = serializeStaticPage({ title: result.title, intro: result.intro, body: result.body, updatedAt: this.deps.page.clock() });
		await this.deps.configStore.replaceValues(new Map([[staticPageKey(id), value]]));
		await this.deps.configCache.invalidate();
		return reply.redirect(`admin_pages.php?page=${id}&done=saved`, 303);
	};

	#list(request: AppRequest, reply: AppReply, notice: string | null): Promise<AppReply> {
		const t = this.deps.page.lang.adminPages;
		const pages = STATIC_PAGE_IDS.map((id) => ({
			title: staticPageContent(id, request.board.staticPages[id], this.deps.page.lang).title,
			editHref: `admin_pages.php?page=${id}`,
			viewHref: `${id}.php`,
			status: request.board.staticPages[id] !== undefined ? t.customized : t.defaultText,
		}));
		return renderAdminPage(request, reply, this.deps, { active: 'pages', template: 'admin_pages.njk', title: t.title }, { notice, pages });
	}

	#form(
		request: AppRequest,
		reply: AppReply,
		id: StaticPageId,
		form: PageForm,
		errors: string[],
		notice: string | null,
	): Promise<AppReply> {
		const t = this.deps.page.lang.adminPages;
		const current = staticPageContent(id, request.board.staticPages[id], this.deps.page.lang);
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'pages', template: 'admin_page_edit.njk', title: t.editTitle(current.title) },
			{
				notice,
				errors,
				id,
				heading: t.editTitle(current.title),
				form,
				customized: request.board.staticPages[id] !== undefined,
				viewHref: `${id}.php`,
				backHref: 'admin_pages.php',
			},
		);
	}
}
