/**
 * Permissions du forum (admin_permissions.php, clés p_* de config), réservées aux administrateurs.
 * Comme le PHP : seules les clés modifiées sont écrites, puis cache_config.php est supprimé.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type FormBody, field } from '../http/forms.ts';
import type { LayoutDeps } from '../http/layout.ts';
import { buildAdminOptions } from '../presenters/adminOptionsPage.ts';
import type { ConfigCache } from '../repositories/ConfigLoader.ts';
import type { ConfigStore } from '../repositories/ConfigRepository.ts';
import { changedOptions, PERMISSION_SECTIONS, readPermissionsForm } from '../services/adminOptions.ts';
import { adminDenied, renderAdminPage } from './adminPage.ts';

export interface AdminPermissionsControllerDeps extends LayoutDeps {
	configStore: ConfigStore;
	configCache: ConfigCache;
}

export interface AdminPermissionsQuery {
	done?: string;
}

export class AdminPermissionsController {
	constructor(private readonly deps: AdminPermissionsControllerDeps) {}

	show = async (request: FastifyRequest<{ Querystring: AdminPermissionsQuery }>, reply: FastifyReply): Promise<FastifyReply> => {
		const denied = adminDenied(request, reply, this.deps, true);
		if (denied !== null) return denied;
		const { lang } = this.deps.page;
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'permissions', template: 'admin_options.njk', title: lang.adminPermissions.title },
			buildAdminOptions({
				sections: PERMISSION_SECTIONS,
				prefix: 'p_',
				texts: lang.adminPermissions,
				formAction: 'admin_permissions.php',
				values: await this.deps.configStore.loadValues(),
				errors: [],
				notice: request.query.done === 'updated' ? lang.adminPermissions.updated : null,
				lang,
			}),
		);
	};

	save = async (request: FastifyRequest<{ Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> => {
		const denied = adminDenied(request, reply, this.deps, true);
		if (denied !== null) return denied;
		const values = readPermissionsForm((key) => field(request.body, `form[${key}]`));
		const changes = changedOptions(await this.deps.configStore.loadValues(), values);
		if (changes.size > 0) {
			await this.deps.configStore.updateValues(changes);
			await this.deps.configCache.invalidate();
		}
		return reply.redirect('admin_permissions.php?done=updated', 303);
	};
}
