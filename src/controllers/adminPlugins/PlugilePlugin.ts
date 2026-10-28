/**
 * Plugin Plugile (AP_Plugile.php) : installation (REPLACE INTO config), désinstallation et réglage du
 * menu des plugiles dans la modification du profil.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type FormBody, field } from '../../http/forms.ts';
import { renderMessage } from '../../http/layout.ts';
import { PLUGILE_DEFAULTS, unescapeHtml } from '../../services/adminPlugins.ts';
import { escapeHtml } from '../../services/bbcode.ts';
import { type AdminLoaderControllerDeps, type AdminLoaderQuery, type PluginHandler, renderPlugin } from './pluginPage.ts';

export class PlugilePlugin implements PluginHandler {
	constructor(private readonly deps: AdminLoaderControllerDeps) {}

	async show(request: FastifyRequest<{ Querystring: AdminLoaderQuery }>, reply: FastifyReply): Promise<FastifyReply> {
		const t = this.deps.page.lang.adminPlugins.plugile;
		const values = await this.deps.configStore.loadValues();
		const notices: Record<string, string> = {
			installed: t.installed,
			reinstalled: t.reinstalled,
			uninstalled: t.uninstalled,
			saved: t.saved,
		};
		return renderPlugin(this.deps, request, reply, 'AP_Plugile.php', 'admin_plugin_plugile.njk', t.title, {
			notice: notices[request.query.done ?? ''] ?? null,
			installed: values.has('o_plugile_version'),
			version: values.get('o_plugile_version') ?? '',
			separateMenu: values.get('o_plugile_menu') === '1',
			menuName: unescapeHtml(values.get('o_plugile_menu_name') ?? ''),
		});
	}

	async submit(request: FastifyRequest<{ Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> {
		const { body } = request;
		const store = this.deps.configStore;
		const installed = (await store.loadValues()).has('o_plugile_version');
		const done = async (name: string): Promise<FastifyReply> => {
			await this.deps.configCache.invalidate();
			return reply.redirect(`admin_loader.php?plugin=AP_Plugile.php&done=${name}`, 303);
		};
		if (field(body, 'update') !== '') {
			await store.replaceValues(PLUGILE_DEFAULTS);
			return done(installed ? 'reinstalled' : 'installed');
		}
		if (field(body, 'delete') !== '') {
			await store.deleteValues([...PLUGILE_DEFAULTS.keys()]);
			return done('uninstalled');
		}
		if (field(body, 'saveconfig') !== '' && installed) {
			// Le PHP enregistre le titre déjà échappé (pun_htmlspecialchars()), tel qu'il l'affiche.
			await store.replaceValues(
				new Map([
					['o_plugile_menu', String(Number.parseInt(field(body, 'menu'), 10) || 0)],
					['o_plugile_menu_name', escapeHtml(field(body, 'plugile_menu_name'))],
				]),
			);
			return done('saved');
		}
		return renderMessage(request, reply, this.deps, 400, this.deps.page.lang.common.badRequest);
	}
}
