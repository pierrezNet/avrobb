/**
 * Plugins d'administration (admin_loader.php?plugin=…). Portage progressif : les plugins portés sont
 * servis par leur module (controllers/adminPlugins/), les autres redirigés vers l'installation PHP.
 * Droits d'admin_loader.php : AP_ pour les administrateurs, AMP_ aussi pour les modérateurs.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FormBody } from '../http/forms.ts';
import { renderMessage } from '../http/layout.ts';
import { ADMIN_PLUGINS } from '../presenters/adminMenu.ts';
import { isAdmin, isAnyModerator } from '../services/permissions.ts';
import { LabelsPlugin } from './adminPlugins/LabelsPlugin.ts';
import { PlugilePlugin } from './adminPlugins/PlugilePlugin.ts';
import { PremiumPlugin } from './adminPlugins/PremiumPlugin.ts';
import { PrivateMessagesPlugin } from './adminPlugins/PrivateMessagesPlugin.ts';
import type { AdminLoaderControllerDeps, AdminLoaderQuery, Plugin, PluginHandler } from './adminPlugins/pluginPage.ts';
import { SmiliesPlugin } from './adminPlugins/SmiliesPlugin.ts';
import { UploadilePlugin } from './adminPlugins/UploadilePlugin.ts';
import { UserManagementPlugin } from './adminPlugins/UserManagementPlugin.ts';

export type { AdminLoaderControllerDeps, AdminLoaderQuery } from './adminPlugins/pluginPage.ts';

const isPlugin = (name: string): name is Plugin => (ADMIN_PLUGINS as readonly string[]).includes(name);

export class AdminLoaderController {
	/** Plugins servis par Node (FluxToolBar, à décider, reste sur le PHP). */
	readonly #ported: ReadonlyMap<Plugin, PluginHandler>;

	constructor(private readonly deps: AdminLoaderControllerDeps) {
		this.#ported = new Map<Plugin, PluginHandler>([
			['AMP_Gestion_utilisateurs.php', new UserManagementPlugin(deps)],
			['AP_Private_messaging.php', new PrivateMessagesPlugin(deps)],
			['AP_Plugile.php', new PlugilePlugin(deps)],
			['AP_Premium.php', new PremiumPlugin(deps)],
			['AP_Uploadile.php', new UploadilePlugin(deps)],
			['AP_Smilies.php', new SmiliesPlugin(deps)],
			['AP_Balises.php', new LabelsPlugin(deps)],
		]);
	}

	show = async (request: FastifyRequest<{ Querystring: AdminLoaderQuery }>, reply: FastifyReply): Promise<FastifyReply> => {
		const plugin = this.#plugin(request, reply);
		if (typeof plugin !== 'string') return plugin;
		const handler = this.#ported.get(plugin);
		return handler !== undefined ? handler.show(request, reply) : this.#toLegacy(request, reply);
	};

	submit = async (
		request: FastifyRequest<{ Querystring: AdminLoaderQuery; Body: FormBody }>,
		reply: FastifyReply,
	): Promise<FastifyReply> => {
		const plugin = this.#plugin(request, reply);
		if (typeof plugin !== 'string') return plugin;
		const handler = this.#ported.get(plugin);
		if (handler === undefined) return renderMessage(request, reply, this.deps, 400, this.deps.page.lang.common.badRequest);
		return handler.submit(request, reply);
	};

	/** Contrôles d'admin_loader.php ; renvoie le nom du plugin, ou la réponse d'erreur. */
	#plugin(request: FastifyRequest<{ Querystring: AdminLoaderQuery }>, reply: FastifyReply): Plugin | Promise<FastifyReply> {
		const { lang } = this.deps.page;
		if (!isAnyModerator(request.viewer)) return renderMessage(request, reply, this.deps, 403, lang.common.noPermission);
		const name = request.query.plugin ?? '';
		if (!/^AM?P_\w*\.php$/i.test(name)) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
		if (name.startsWith('AP_') && !isAdmin(request.viewer)) return renderMessage(request, reply, this.deps, 403, lang.common.noPermission);
		if (!isPlugin(name)) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
		return name;
	}

	#toLegacy(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> | FastifyReply {
		// Sans installation PHP (LEGACY_BASE_URL vide), rediriger bouclerait sur Node.
		if (this.deps.legacyBaseUrl === '') return renderMessage(request, reply, this.deps, 404, this.deps.page.lang.common.badRequest);
		const search = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
		return reply.redirect(`${this.deps.legacyBaseUrl}/admin_loader.php${search}`);
	}
}
