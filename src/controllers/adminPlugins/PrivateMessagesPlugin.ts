/**
 * Plugin de messagerie privée (AP_Private_messaging.php) : activation, notification, nombre de
 * destinataires, et droits de chaque groupe (g_pm, g_pm_limit).
 */

import type { AppReply, AppRequest } from '../../http/context.ts';
import { type FormBody, field } from '../../http/forms.ts';
import { readGroupPrivateMessageRights, readPrivateMessageSettings } from '../../services/adminPlugins.ts';
import {
	type AdminLoaderControllerDeps,
	type AdminLoaderQuery,
	type PluginHandler,
	renderPlugin,
	saveConfigChanges,
} from './pluginPage.ts';

export class PrivateMessagesPlugin implements PluginHandler {
	constructor(private readonly deps: AdminLoaderControllerDeps) {}

	async show(request: AppRequest<{ Querystring: AdminLoaderQuery }>, reply: AppReply): Promise<AppReply> {
		const t = this.deps.page.lang.adminPlugins.privateMessages;
		const values = await this.deps.configStore.loadValues();
		return renderPlugin(this.deps, request, reply, 'AP_Private_messaging.php', 'admin_plugin_pms.njk', t.title, {
			notice: request.query.done === 'saved' ? t.saved : null,
			enabled: values.get('o_pms_enabled') === '1',
			notification: values.get('o_pms_notification') === '1',
			// Le PHP enregistre le nombre saisi plus un (l'expéditeur compte parmi les destinataires).
			maxReceivers: Number(values.get('o_pms_max_receiver') ?? '1') - 1,
			groups: await this.deps.groupAdmin.listPrivateMessageRights(),
		});
	}

	async submit(request: AppRequest<{ Body: FormBody }>, reply: AppReply): Promise<AppReply> {
		const read = (name: string): string => field(request.body, name);
		await saveConfigChanges(this.deps, readPrivateMessageSettings(read));
		for (const group of await this.deps.groupAdmin.listPrivateMessageRights()) {
			const rights = readGroupPrivateMessageRights(read, group.id);
			if (rights !== null) await this.deps.groupAdmin.setPrivateMessageRights(group.id, rights.allowed, rights.limit);
		}
		return reply.redirect('admin_loader.php?plugin=AP_Private_messaging.php&done=saved', 303);
	}
}
