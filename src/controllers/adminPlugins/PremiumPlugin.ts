/**
 * Plugin Premium (AP_Premium.php) : promotion de membres dans un groupe pour une durée donnée, table
 * premium créée et supprimée par le plugin. Pas de retour automatique au groupe initial à l'échéance :
 * le PHP ne le faisait pas non plus.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type FormBody, field } from '../../http/forms.ts';
import { renderMessage } from '../../http/layout.ts';
import { buildPremiumMembers } from '../../presenters/adminPluginsPage.ts';
import { type AdminLoaderControllerDeps, type AdminLoaderQuery, type PluginHandler, renderPlugin } from './pluginPage.ts';

export class PremiumPlugin implements PluginHandler {
	constructor(private readonly deps: AdminLoaderControllerDeps) {}

	show(request: FastifyRequest<{ Querystring: AdminLoaderQuery }>, reply: FastifyReply): Promise<FastifyReply> {
		return this.#renderPremium(request, reply, [], request.query.done ?? null);
	}

	submit(request: FastifyRequest<{ Querystring: AdminLoaderQuery; Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> {
		return this.#savePremium(request, reply);
	}

	async #renderPremium(
		request: FastifyRequest,
		reply: FastifyReply,
		errors: string[],
		done: string | null,
		status = 200,
	): Promise<FastifyReply> {
		const { lang, clock } = this.deps.page;
		const t = lang.adminPlugins.premium;
		const store = this.deps.premiumAdmin;
		const installed = await store.isInstalled();
		const notices: Record<string, string> = { installed: t.installOk, uninstalled: t.uninstallOk, added: t.added, removed: t.removed };
		reply.code(status);
		return renderPlugin(this.deps, request, reply, 'AP_Premium.php', 'admin_plugin_premium.njk', t.title, {
			notice: notices[done ?? ''] ?? null,
			errors,
			installed,
			groups: installed ? (await store.listGroups()).map((g) => ({ ...g, selected: g.title.toLowerCase() === 'premium' })) : [],
			members: installed ? buildPremiumMembers(await store.listMembers(), clock(), lang) : [],
		});
	}

	async #savePremium(request: FastifyRequest<{ Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> {
		const { lang, clock } = this.deps.page;
		const t = lang.adminPlugins.premium;
		const { body } = request;
		const store = this.deps.premiumAdmin;
		const installed = await store.isInstalled();
		const done = (name: string): FastifyReply => reply.redirect(`admin_loader.php?plugin=AP_Premium.php&done=${name}`, 303);
		if (field(body, 'install') !== '' && !installed) {
			await store.install();
			return done('installed');
		}
		if (field(body, 'cancel') !== '' && installed) {
			await store.uninstall();
			return done('uninstalled');
		}
		if (!installed) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
		if (field(body, 'add_user') !== '') {
			const email = field(body, 'courriel').trim().toLowerCase();
			const groupId = Number.parseInt(field(body, 'group_id_premium'), 10);
			const days = field(body, 'end_premium').trim();
			if (email === '' || Number.isNaN(groupId) || days === '') return this.#renderPremium(request, reply, [t.allNeeded], null, 400);
			if (!/^\d+(\.\d+)?$/.test(days)) return this.#renderPremium(request, reply, [t.invalidTime], null, 400);
			if (!(await store.listGroups()).some((g) => g.id === groupId))
				return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
			const now = clock();
			const result = await store.addMember(email, groupId, now, now + Math.round(Number(days) * 86400));
			if (result === 'notFound') return this.#renderPremium(request, reply, [t.notFound], null, 400);
			if (result === 'already') return this.#renderPremium(request, reply, [t.alreadyPremium], null, 400);
			return done('added');
		}
		if (field(body, 'delete_user') !== '') {
			const ids = Object.keys(body)
				.map((name) => /^delete_prem\[(\d{1,10})\]$/.exec(name)?.[1])
				.filter((id): id is string => id !== undefined)
				.map(Number);
			await store.removeMembers(ids);
			return done('removed');
		}
		return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
	}
}
