/**
 * Commun aux plugins d'administration servis par admin_loader.php : dépendances, contrat d'un plugin,
 * rendu dans la mise en page de l'administration et écriture des réglages modifiés.
 */

import type { Mailer } from '../../adapters/mailer.ts';
import type { AppReply, AppRequest } from '../../http/context.ts';
import type { FormBody } from '../../http/forms.ts';
import type { LayoutDeps } from '../../http/layout.ts';
import type { ADMIN_PLUGINS } from '../../presenters/adminMenu.ts';
import type { BanReader } from '../../repositories/BanRepository.ts';
import type { CensorReader } from '../../repositories/CensorRepository.ts';
import type { ConfigCache } from '../../repositories/ConfigLoader.ts';
import type { ConfigStore } from '../../repositories/ConfigRepository.ts';
import type { GroupAdminStore } from '../../repositories/GroupAdminRepository.ts';
import type { SubjectPrefixStore } from '../../repositories/SubjectPrefixRepository.ts';
import { changedOptions } from '../../services/adminOptions.ts';
import type { MailTemplateReader } from '../../services/mail.ts';
import { renderAdminPage } from '../adminPage.ts';

export interface AdminLoaderControllerDeps extends LayoutDeps {
	bans: BanReader;
	censorship: CensorReader;
	mailTemplates: MailTemplateReader;
	mailer: Mailer;
	configStore: ConfigStore;
	configCache: ConfigCache;
	groupAdmin: GroupAdminStore;
	subjectPrefixes: SubjectPrefixStore;
}

export interface AdminLoaderQuery {
	plugin?: string;
	done?: string;
	/** Plugin des balises : add, edit, delete. */
	action?: string;
	id?: string;
	/** Balise du sujet visée (actions tag_*). */
	tag?: string;
}

export type Plugin = (typeof ADMIN_PLUGINS)[number];

/** Un plugin porté : affichage (GET) et envoi d'un de ses formulaires (POST). */
export interface PluginHandler {
	show(request: AppRequest<{ Querystring: AdminLoaderQuery }>, reply: AppReply): Promise<AppReply>;
	submit(request: AppRequest<{ Querystring: AdminLoaderQuery; Body: FormBody }>, reply: AppReply): Promise<AppReply>;
}

/** Page d'un plugin dans l'administration ; `view` reçoit aussi `formAction` (adresse du plugin). */
export function renderPlugin(
	deps: LayoutDeps,
	request: AppRequest,
	reply: AppReply,
	plugin: Plugin,
	template: string,
	title: string,
	view: object,
): Promise<AppReply> {
	return renderAdminPage(
		request,
		reply,
		deps,
		{ active: plugin, template, title },
		{ ...view, formAction: `admin_loader.php?plugin=${plugin}` },
	);
}

/** Écrit les clés modifiées de config et invalide les caches (generate_config_cache()). */
export async function saveConfigChanges(
	deps: Pick<AdminLoaderControllerDeps, 'configStore' | 'configCache'>,
	values: ReadonlyMap<string, string>,
): Promise<void> {
	const changes = changedOptions(await deps.configStore.loadValues(), values);
	if (changes.size === 0) return;
	await deps.configStore.updateValues(changes);
	await deps.configCache.invalidate();
}
