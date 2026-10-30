/**
 * Mots censurés (admin_censoring.php), réservés aux administrateurs : ajout, modification et
 * suppression.
 */

import type { AppReply, AppRequest } from '../http/context.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage } from '../http/layout.ts';
import type { CensorStore } from '../repositories/CensorRepository.ts';
import { punTrim } from '../services/phpString.ts';
import { adminDenied, renderAdminPage } from './adminPage.ts';

export interface AdminCensoringControllerDeps extends LayoutDeps {
	censorship: CensorStore;
}

export interface AdminCensoringQuery {
	done?: string;
}

/** Identifiant porté par le nom du bouton (update[<id>], remove[<id>]), comme key($_POST['update']). */
function buttonId(body: FormBody, name: string): number | null {
	for (const key of Object.keys(body)) {
		const match = new RegExp(`^${name}\\[(\\d{1,10})\\]$`).exec(key);
		if (match?.[1] !== undefined) return Number(match[1]);
	}
	return null;
}

export class AdminCensoringController {
	constructor(private readonly deps: AdminCensoringControllerDeps) {}

	show = async (request: AppRequest<{ Querystring: AdminCensoringQuery }>, reply: AppReply): Promise<AppReply> => {
		const denied = adminDenied(request, reply, this.deps, true);
		if (denied !== null) return denied;
		const t = this.deps.page.lang.adminCensoring;
		const notices: Record<string, string> = { added: t.wordAdded, updated: t.wordUpdated, removed: t.wordRemoved };
		return this.#render(request, reply, [], notices[request.query.done ?? ''] ?? null);
	};

	submit = async (request: AppRequest<{ Body: FormBody }>, reply: AppReply): Promise<AppReply> => {
		const denied = adminDenied(request, reply, this.deps, true);
		if (denied !== null) return denied;
		const { lang } = this.deps.page;
		const t = lang.adminCensoring;
		const { body } = request;
		const store = this.deps.censorship;
		let done: string;

		if (field(body, 'add_word') !== '') {
			const searchFor = punTrim(field(body, 'new_search_for'));
			if (searchFor === '') return this.#render(request, reply, [t.mustEnterWord], null, 400);
			await store.addWord({ searchFor, replaceWith: punTrim(field(body, 'new_replace_with')) });
			done = 'added';
		} else if (buttonId(body, 'update') !== null) {
			const id = buttonId(body, 'update') ?? 0;
			const searchFor = punTrim(field(body, `search_for[${id}]`));
			if (searchFor === '') return this.#render(request, reply, [t.mustEnterWord], null, 400);
			await store.updateWord(id, { searchFor, replaceWith: punTrim(field(body, `replace_with[${id}]`)) });
			done = 'updated';
		} else if (buttonId(body, 'remove') !== null) {
			await store.removeWord(buttonId(body, 'remove') ?? 0);
			done = 'removed';
		} else return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);

		return reply.redirect(`admin_censoring.php?done=${done}`, 303);
	};

	async #render(request: AppRequest, reply: AppReply, errors: string[], notice: string | null, status = 200): Promise<AppReply> {
		const t = this.deps.page.lang.adminCensoring;
		reply.code(status);
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'censoring', template: 'admin_censoring.njk', title: t.title },
			{ words: await this.deps.censorship.listEntries(), enabled: request.board.censoring, errors, notice },
		);
	}
}
