/**
 * Plugin Easy Poll + (AP_Sondage.php) : nombre maximal d'options d'un nouveau sondage.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type FormBody, field } from '../../http/forms.ts';
import { readPollMaxOptions } from '../../services/adminPlugins.ts';
import {
	type AdminLoaderControllerDeps,
	type AdminLoaderQuery,
	type PluginHandler,
	renderPlugin,
	saveConfigChanges,
} from './pluginPage.ts';

export class PollPlugin implements PluginHandler {
	constructor(private readonly deps: AdminLoaderControllerDeps) {}

	async show(request: FastifyRequest<{ Querystring: AdminLoaderQuery }>, reply: FastifyReply): Promise<FastifyReply> {
		const t = this.deps.page.lang.adminPlugins.poll;
		return renderPlugin(this.deps, request, reply, 'AP_Sondage.php', 'admin_plugin_poll.njk', t.title, {
			notice: request.query.done === 'saved' ? t.saved : null,
			maxOptions: (await this.deps.configStore.loadValues()).get('poll_max_fields') ?? '',
		});
	}

	async submit(request: FastifyRequest<{ Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> {
		await saveConfigChanges(this.deps, new Map([['poll_max_fields', readPollMaxOptions(field(request.body, 'max_options'))]]));
		return reply.redirect('admin_loader.php?plugin=AP_Sondage.php&done=saved', 303);
	}
}
