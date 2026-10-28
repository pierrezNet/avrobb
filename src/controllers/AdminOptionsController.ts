/**
 * Options du forum (admin_options.php), réservées aux administrateurs. L'enregistrement n'écrit que
 * les clés modifiées, puis supprime cache_config.php et les flux en cache (generate_config_cache()
 * et clear_feed_cache() du PHP).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage } from '../http/layout.ts';
import { buildAdminOptions } from '../presenters/adminOptionsPage.ts';
import type { ConfigCache } from '../repositories/ConfigLoader.ts';
import type { ConfigStore } from '../repositories/ConfigRepository.ts';
import type { PhpCacheStore } from '../repositories/PhpCacheFiles.ts';
import { changedOptions, type OptionsError, readOptionsForm } from '../services/adminOptions.ts';
import { adminDenied, renderAdminPage } from './adminPage.ts';

export interface AdminOptionsControllerDeps extends LayoutDeps {
	configStore: ConfigStore;
	configCache: ConfigCache;
	phpCache: PhpCacheStore | null;
}

export interface AdminOptionsQuery {
	done?: string;
}

export class AdminOptionsController {
	constructor(private readonly deps: AdminOptionsControllerDeps) {}

	show = async (request: FastifyRequest<{ Querystring: AdminOptionsQuery }>, reply: FastifyReply): Promise<FastifyReply> => {
		const denied = adminDenied(request, reply, this.deps, true);
		if (denied !== null) return denied;
		const notice = request.query.done === 'updated' ? this.deps.page.lang.adminOptions.updated : null;
		return this.#render(request, reply, await this.deps.configStore.loadValues(), [], notice);
	};

	save = async (request: FastifyRequest<{ Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> => {
		const denied = adminDenied(request, reply, this.deps, true);
		if (denied !== null) return denied;
		const { lang } = this.deps.page;
		const result = readOptionsForm((key) => field(request.body, `form[${key}]`), lang.adminOptions.defaults);
		if (result.kind === 'badRequest') return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);

		const current = await this.deps.configStore.loadValues();
		if (result.kind === 'invalid') {
			// Saisie réaffichée telle quelle (sans les mots de passe SMTP) pour être corrigée.
			const submitted = new Map(current);
			for (const name of current.keys()) {
				const sent = request.body[`form[${name.slice(2)}]`];
				if (name.startsWith('o_') && typeof sent === 'string') submitted.set(name, sent);
			}
			return this.#render(request, reply, submitted, result.errors, null, 400);
		}

		const changes = changedOptions(current, result.values);
		if (changes.size > 0) {
			await this.deps.configStore.updateValues(changes);
			await this.deps.configCache.invalidate();
		}
		await this.deps.phpCache?.invalidateFeeds();
		return reply.redirect('admin_options.php?done=updated', 303);
	};

	#render(
		request: FastifyRequest,
		reply: FastifyReply,
		values: ReadonlyMap<string, string>,
		errors: readonly OptionsError[],
		notice: string | null,
		status = 200,
	): Promise<FastifyReply> {
		const { lang } = this.deps.page;
		reply.code(status);
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'options', template: 'admin_options.njk', title: lang.adminOptions.title },
			buildAdminOptions({ values, errors, notice, lang }),
		);
	}
}
