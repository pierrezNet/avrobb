/**
 * Pages d'administration propres à PV (admin_loader.php?plugin=…), chacune servie par son module
 * (controllers/adminPlugins/). Droits d'admin_loader.php : AP_ pour les administrateurs, AMP_ aussi
 * pour les modérateurs. Les anciens plugins abandonnés (FluxToolBar, Plugile, Uploadile, Premium…) sont refusés.
 */

import type { AppReply, AppRequest } from '../http/context.ts';
import type { FormBody } from '../http/forms.ts';
import { renderMessage } from '../http/layout.ts';
import { ADMIN_PLUGINS } from '../presenters/adminMenu.ts';
import { isAdmin, isAnyModerator } from '../services/permissions.ts';
import { LabelsPlugin } from './adminPlugins/LabelsPlugin.ts';
import { PrivateMessagesPlugin } from './adminPlugins/PrivateMessagesPlugin.ts';
import type { AdminLoaderControllerDeps, AdminLoaderQuery, Plugin, PluginHandler } from './adminPlugins/pluginPage.ts';

export type { AdminLoaderControllerDeps, AdminLoaderQuery } from './adminPlugins/pluginPage.ts';

const isPlugin = (name: string): name is Plugin => (ADMIN_PLUGINS as readonly string[]).includes(name);

export class AdminLoaderController {
	readonly #pages: ReadonlyMap<Plugin, PluginHandler>;

	constructor(private readonly deps: AdminLoaderControllerDeps) {
		this.#pages = new Map<Plugin, PluginHandler>([
			['AP_Private_messaging.php', new PrivateMessagesPlugin(deps)],
			['AP_Balises.php', new LabelsPlugin(deps)],
		]);
	}

	show = async (request: AppRequest<{ Querystring: AdminLoaderQuery }>, reply: AppReply): Promise<AppReply> => {
		const plugin = this.#plugin(request, reply);
		if (typeof plugin !== 'string') return plugin;
		const handler = this.#pages.get(plugin);
		if (handler === undefined) return renderMessage(request, reply, this.deps, 400, this.deps.page.lang.common.badRequest);
		return handler.show(request, reply);
	};

	submit = async (request: AppRequest<{ Querystring: AdminLoaderQuery; Body: FormBody }>, reply: AppReply): Promise<AppReply> => {
		const plugin = this.#plugin(request, reply);
		if (typeof plugin !== 'string') return plugin;
		const handler = this.#pages.get(plugin);
		if (handler === undefined) return renderMessage(request, reply, this.deps, 400, this.deps.page.lang.common.badRequest);
		return handler.submit(request, reply);
	};

	/** Contrôles d'admin_loader.php ; renvoie le nom du plugin, ou la réponse d'erreur. */
	#plugin(request: AppRequest<{ Querystring: AdminLoaderQuery }>, reply: AppReply): Plugin | Promise<AppReply> {
		const { lang } = this.deps.page;
		if (!isAnyModerator(request.viewer)) return renderMessage(request, reply, this.deps, 403, lang.common.noPermission);
		const name = request.query.plugin ?? '';
		if (!/^AM?P_\w*\.php$/i.test(name)) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
		if (name.startsWith('AP_') && !isAdmin(request.viewer)) return renderMessage(request, reply, this.deps, 403, lang.common.noPermission);
		if (!isPlugin(name)) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
		return name;
	}
}
