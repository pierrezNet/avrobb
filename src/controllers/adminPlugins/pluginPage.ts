/**
 * Commun aux plugins d'administration servis par admin_loader.php : dépendances, contrat d'un plugin,
 * rendu dans la mise en page de l'administration et écriture des réglages modifiés.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Mailer } from '../../adapters/mailer.ts';
import type { FormBody } from '../../http/forms.ts';
import type { LayoutDeps } from '../../http/layout.ts';
import type { ADMIN_PLUGINS } from '../../presenters/adminMenu.ts';
import type { BanReader } from '../../repositories/BanRepository.ts';
import type { CensorReader } from '../../repositories/CensorRepository.ts';
import type { ConfigCache } from '../../repositories/ConfigLoader.ts';
import type { ConfigStore } from '../../repositories/ConfigRepository.ts';
import type { GroupAdminStore } from '../../repositories/GroupAdminRepository.ts';
import type { LabelAdminStore } from '../../repositories/LabelAdminRepository.ts';
import type { MailTemplateReader } from '../../repositories/MailTemplateFiles.ts';
import type { UploadStore } from '../../repositories/MemberUploadFiles.ts';
import type { PhpCacheStore } from '../../repositories/PhpCacheFiles.ts';
import type { PremiumAdminStore } from '../../repositories/PremiumAdminRepository.ts';
import type { ProfileStore } from '../../repositories/ProfileRepository.ts';
import type { RegistrationStore } from '../../repositories/RegistrationRepository.ts';
import type { SmileyAdminStore, SmileyImageStore } from '../../repositories/SmileyAdminRepository.ts';
import type { UploadileAdminStore } from '../../repositories/UserAdminRepository.ts';
import { changedOptions } from '../../services/adminOptions.ts';
import { renderAdminPage } from '../adminPage.ts';

export interface AdminLoaderControllerDeps extends LayoutDeps {
	registrations: RegistrationStore;
	bans: BanReader;
	censorship: CensorReader;
	mailTemplates: MailTemplateReader;
	mailer: Mailer;
	phpCache: PhpCacheStore | null;
	legacyBaseUrl: string;
	configStore: ConfigStore;
	configCache: ConfigCache;
	groupAdmin: GroupAdminStore;
	premiumAdmin: PremiumAdminStore;
	uploads: UploadStore;
	userAdmin: UploadileAdminStore;
	profileStore: Pick<ProfileStore, 'setUploadedBytes'>;
	smileyAdmin: SmileyAdminStore;
	smileyImages: SmileyImageStore;
	labelAdmin: LabelAdminStore;
}

export interface AdminLoaderQuery {
	plugin?: string;
	done?: string;
	/** Plugin des balises : add, edit, delete. */
	action?: string;
	id?: string;
}

export type Plugin = (typeof ADMIN_PLUGINS)[number];

/** Un plugin porté : affichage (GET) et envoi d'un de ses formulaires (POST). */
export interface PluginHandler {
	show(request: FastifyRequest<{ Querystring: AdminLoaderQuery }>, reply: FastifyReply): Promise<FastifyReply>;
	submit(request: FastifyRequest<{ Querystring: AdminLoaderQuery; Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply>;
}

/** Page d'un plugin dans l'administration ; `view` reçoit aussi `formAction` (adresse du plugin). */
export function renderPlugin(
	deps: LayoutDeps,
	request: FastifyRequest,
	reply: FastifyReply,
	plugin: Plugin,
	template: string,
	title: string,
	view: object,
): Promise<FastifyReply> {
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
