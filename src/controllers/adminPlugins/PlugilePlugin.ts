/**
 * Plugin Plugile (AP_Plugile.php) : réglage du menu des plugiles dans la modification du profil.
 * L'installation et la désinstallation du mod (FluxBB) ne font pas partie d'AvroBB.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type FormBody, field } from '../../http/forms.ts';
import { renderMessage } from '../../http/layout.ts';
import { unescapeHtml } from '../../services/adminPlugins.ts';
import { escapeHtml } from '../../services/bbcode.ts';
import { type AdminLoaderControllerDeps, type AdminLoaderQuery, type PluginHandler, renderPlugin } from './pluginPage.ts';

export class PlugilePlugin implements PluginHandler {
	constructor(private readonly deps: AdminLoaderControllerDeps) {}

	async show(request: FastifyRequest<{ Querystring: AdminLoaderQuery }>, reply: FastifyReply): Promise<FastifyReply> {
		const t = this.deps.page.lang.adminPlugins.plugile;
		const values = await this.deps.configStore.loadValues();

		return renderPlugin(this.deps, request, reply, 'AP_Plugile.php', 'admin_plugin_plugile.njk', t.title, {
			notice: request.query.done === 'saved' ? t.saved : null,
			separateMenu: values.get('o_plugile_menu') === '1',
			menuName: unescapeHtml(values.get('o_plugile_menu_name') ?? ''),
		});
	}

	async submit(request: FastifyRequest<{ Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> {
		const { body } = request;
		const store = this.deps.configStore;
		if (field(body, 'saveconfig') !== '') {
			// Le PHP enregistre le titre déjà échappé (pun_htmlspecialchars()), tel qu'il l'affiche.
			await store.replaceValues(
				new Map([
					['o_plugile_menu', String(Number.parseInt(field(body, 'menu'), 10) || 0)],
					['o_plugile_menu_name', escapeHtml(field(body, 'plugile_menu_name'))],
				]),
			);
			await this.deps.configCache.invalidate();
			return reply.redirect('admin_loader.php?plugin=AP_Plugile.php&done=saved', 303);
		}
		return renderMessage(request, reply, this.deps, 400, this.deps.page.lang.common.badRequest);
	}
}
