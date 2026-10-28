/**
 * Plugins d'administration (admin_loader.php?plugin=…). Portage progressif : les plugins portés sont
 * servis ici, les autres redirigés vers l'installation PHP. Droits d'admin_loader.php : AP_ pour les
 * administrateurs, AMP_ aussi pour les modérateurs.
 *
 * Portés : AMP_Gestion_utilisateurs.php (ajout d'utilisateur ; l'élagage, désactivé par PV — formulaire
 * sans bouton —, n'est pas repris), AP_Sondage.php, AP_Private_messaging.php, AP_Plugile.php, AP_Premium.php
 * (sans retour automatique au groupe initial à l'échéance : le PHP ne le faisait pas non plus).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Mailer } from '../adapters/mailer.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage } from '../http/layout.ts';
import { ADMIN_PLUGINS } from '../presenters/adminMenu.ts';
import { buildPremiumMembers } from '../presenters/adminPluginsPage.ts';
import type { BanReader } from '../repositories/BanRepository.ts';
import type { CensorReader } from '../repositories/CensorRepository.ts';
import type { ConfigCache } from '../repositories/ConfigLoader.ts';
import type { ConfigStore } from '../repositories/ConfigRepository.ts';
import type { GroupAdminStore } from '../repositories/GroupAdminRepository.ts';
import type { MailTemplateReader } from '../repositories/MailTemplateFiles.ts';
import type { PhpCacheStore } from '../repositories/PhpCacheFiles.ts';
import type { PremiumAdminStore } from '../repositories/PremiumAdminRepository.ts';
import type { RegistrationStore } from '../repositories/RegistrationRepository.ts';
import { changedOptions } from '../services/adminOptions.ts';
import { escapeHtml } from '../services/bbcode.ts';
import { buildCensor } from '../services/censor.ts';
import { punHash } from '../services/legacySession.ts';
import { fillTemplate, isValidEmail, randomPassword } from '../services/mail.ts';
import { isAdmin, isAnyModerator } from '../services/permissions.ts';
import { checkUsername, MIN_PASSWORD_LENGTH, normalizeUsername, usernameSkeleton } from '../services/registration.ts';
import { renderAdminPage } from './adminPage.ts';

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
}

/** Plugins servis par Node ; les autres sont redirigés vers le PHP. */
const PORTED: ReadonlySet<string> = new Set([
	'AMP_Gestion_utilisateurs.php',
	'AP_Sondage.php',
	'AP_Private_messaging.php',
	'AP_Plugile.php',
	'AP_Premium.php',
]);

const PLUGILE_KEYS = ['o_plugile_version', 'o_plugile_menu', 'o_plugile_menu_name'] as const;

/** Inverse de pun_htmlspecialchars() : le titre Plugile est stocké échappé, il est réaffiché tel que saisi. */
function unescapeHtml(text: string): string {
	return text.replace(/&(amp|lt|gt|quot|#0?39);/g, (_, entity: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"' })[entity] ?? "'");
}

export interface AdminLoaderQuery {
	plugin?: string;
	done?: string;
}

type Plugin = (typeof ADMIN_PLUGINS)[number];

const isPlugin = (name: string): name is Plugin => (ADMIN_PLUGINS as readonly string[]).includes(name);

export class AdminLoaderController {
	constructor(private readonly deps: AdminLoaderControllerDeps) {}

	show = async (request: FastifyRequest<{ Querystring: AdminLoaderQuery }>, reply: FastifyReply): Promise<FastifyReply> => {
		const plugin = await this.#plugin(request, reply);
		if (typeof plugin !== 'string') return plugin;
		if (!PORTED.has(plugin)) return this.#toLegacy(request, reply);
		const t = this.deps.page.lang.adminPlugins;
		const done = request.query.done;
		switch (plugin) {
			case 'AP_Sondage.php':
				return this.#renderSettings(request, reply, plugin, 'admin_plugin_poll.njk', t.poll.title, {
					notice: done === 'saved' ? t.poll.saved : null,
					maxOptions: (await this.deps.configStore.loadValues()).get('poll_max_fields') ?? '',
				});
			case 'AP_Private_messaging.php': {
				const values = await this.deps.configStore.loadValues();
				return this.#renderSettings(request, reply, plugin, 'admin_plugin_pms.njk', t.privateMessages.title, {
					notice: done === 'saved' ? t.privateMessages.saved : null,
					enabled: values.get('o_pms_enabled') === '1',
					notification: values.get('o_pms_notification') === '1',
					// Le PHP enregistre le nombre saisi plus un (l'expéditeur compte parmi les destinataires).
					maxReceivers: Number(values.get('o_pms_max_receiver') ?? '1') - 1,
					groups: await this.deps.groupAdmin.listPrivateMessageRights(),
				});
			}
			case 'AP_Plugile.php': {
				const values = await this.deps.configStore.loadValues();
				const notices: Record<string, string> = {
					installed: t.plugile.installed,
					reinstalled: t.plugile.reinstalled,
					uninstalled: t.plugile.uninstalled,
					saved: t.plugile.saved,
				};
				return this.#renderSettings(request, reply, plugin, 'admin_plugin_plugile.njk', t.plugile.title, {
					notice: notices[done ?? ''] ?? null,
					installed: values.has('o_plugile_version'),
					version: values.get('o_plugile_version') ?? '',
					separateMenu: values.get('o_plugile_menu') === '1',
					menuName: unescapeHtml(values.get('o_plugile_menu_name') ?? ''),
				});
			}
			case 'AP_Premium.php':
				return this.#renderPremium(request, reply, [], done ?? null);
			default:
				return this.#renderUserManagement(request, reply, [], done === 'created' ? t.userManagement.created : null);
		}
	};

	submit = async (
		request: FastifyRequest<{ Querystring: AdminLoaderQuery; Body: FormBody }>,
		reply: FastifyReply,
	): Promise<FastifyReply> => {
		const plugin = await this.#plugin(request, reply);
		if (typeof plugin !== 'string') return plugin;
		const { body } = request;
		const badRequest = (): Promise<FastifyReply> => renderMessage(request, reply, this.deps, 400, this.deps.page.lang.common.badRequest);
		const back = (done: string): FastifyReply => reply.redirect(`admin_loader.php?plugin=${plugin}&done=${done}`, 303);
		switch (plugin) {
			case 'AMP_Gestion_utilisateurs.php':
				return field(body, 'add_user') !== '' ? this.#addUser(request, reply) : badRequest();
			case 'AP_Sondage.php': {
				const max = Number.parseInt(field(body, 'max_options').trim(), 10);
				await this.#saveConfig(new Map([['poll_max_fields', String(Number.isNaN(max) ? 0 : max)]]));
				return back('saved');
			}
			case 'AP_Private_messaging.php':
				return this.#savePrivateMessages(request, reply);
			case 'AP_Plugile.php':
				return this.#savePlugile(request, reply);
			case 'AP_Premium.php':
				return this.#savePremium(request, reply);
			default:
				return badRequest();
		}
	};

	/** Écrit les clés modifiées de config et invalide les caches (generate_config_cache()). */
	async #saveConfig(values: ReadonlyMap<string, string>): Promise<void> {
		const changes = changedOptions(await this.deps.configStore.loadValues(), values);
		if (changes.size === 0) return;
		await this.deps.configStore.updateValues(changes);
		await this.deps.configCache.invalidate();
	}

	async #savePrivateMessages(request: FastifyRequest<{ Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> {
		const { body } = request;
		const receivers = Number.parseInt(field(body, 'form[pms_max_receiver]').trim(), 10);
		await this.#saveConfig(
			new Map([
				['o_pms_enabled', field(body, 'form[pms_enabled]') === '1' ? '1' : '0'],
				['o_pms_notification', field(body, 'form[pms_notification]') === '1' ? '1' : '0'],
				['o_pms_max_receiver', String((Number.isNaN(receivers) ? 0 : Math.max(0, receivers)) + 1)],
			]),
		);
		for (const group of await this.deps.groupAdmin.listPrivateMessageRights()) {
			const allowed = field(body, `allow[${group.id}]`);
			const limit = field(body, `limit[${group.id}]`);
			if (allowed === '' && limit === '') continue;
			const parsedLimit = Number.parseInt(limit, 10);
			await this.deps.groupAdmin.setPrivateMessageRights(
				group.id,
				allowed === '1',
				Number.isNaN(parsedLimit) ? 0 : Math.max(0, parsedLimit),
			);
		}
		return reply.redirect('admin_loader.php?plugin=AP_Private_messaging.php&done=saved', 303);
	}

	async #savePlugile(request: FastifyRequest<{ Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> {
		const { body } = request;
		const store = this.deps.configStore;
		const installed = (await store.loadValues()).has('o_plugile_version');
		const done = (name: string): FastifyReply => reply.redirect(`admin_loader.php?plugin=AP_Plugile.php&done=${name}`, 303);
		if (field(body, 'update') !== '') {
			await store.replaceValues(new Map([...PLUGILE_KEYS].map((key, i) => [key, ['2.0', '1', 'Plugile'][i] ?? ''])));
			await this.deps.configCache.invalidate();
			return done(installed ? 'reinstalled' : 'installed');
		}
		if (field(body, 'delete') !== '') {
			await store.deleteValues(PLUGILE_KEYS);
			await this.deps.configCache.invalidate();
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
			await this.deps.configCache.invalidate();
			return done('saved');
		}
		return renderMessage(request, reply, this.deps, 400, this.deps.page.lang.common.badRequest);
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
		return this.#renderSettings(request, reply, 'AP_Premium.php', 'admin_plugin_premium.njk', t.title, {
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

	#renderSettings(
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
			this.deps,
			{ active: plugin, template, title },
			{ ...view, formAction: `admin_loader.php?plugin=${plugin}` },
		);
	}

	/** Contrôles d'admin_loader.php ; renvoie le nom du plugin, ou la réponse d'erreur. */
	async #plugin(request: FastifyRequest<{ Querystring: AdminLoaderQuery }>, reply: FastifyReply): Promise<Plugin | FastifyReply> {
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

	#renderUserManagement(
		request: FastifyRequest,
		reply: FastifyReply,
		errors: string[],
		notice: string | null,
		status = 200,
	): Promise<FastifyReply> {
		const t = this.deps.page.lang.adminPlugins.userManagement;
		reply.code(status);
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'AMP_Gestion_utilisateurs.php', template: 'admin_plugin_users.njk', title: t.title },
			{ errors, notice, formAction: 'admin_loader.php?plugin=AMP_Gestion_utilisateurs.php' },
		);
	}

	/** Ajout d'utilisateur du plugin : contrôles de register.php sur le pseudo, compte créé tel quel. */
	async #addUser(request: FastifyRequest<{ Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> {
		const { lang, clock } = this.deps.page;
		const config = request.board;
		const { body } = request;
		const username = normalizeUsername(field(body, 'username'));
		const email = field(body, 'email').trim().toLowerCase();
		const random = field(body, 'random_pass') === '1';
		const password = random ? randomPassword(8) : field(body, 'password').trim();

		const [bans, censoredWords, similar] = await Promise.all([
			this.deps.bans.listBans(),
			config.censoring ? this.deps.censorship.listWords() : [],
			this.deps.registrations.findSimilarUsername(username, usernameSkeleton(username)),
		]);
		// Pseudo banni accepté : c'est l'administrateur qui crée le compte, comme le plugin.
		const errors = [
			...checkUsername(username, lang.common.guest, bans, config.censoring ? buildCensor(censoredWords) : null)
				.filter((error) => error !== 'banned')
				.map((error) => lang.register.errors[error]),
			...(similar !== null ? [lang.register.usernameDupe(similar)] : []),
			...(password.length < MIN_PASSWORD_LENGTH ? [lang.register.errors.passTooShort] : []),
			...(!isValidEmail(email) ? [lang.register.errors.invalidEmail] : []),
		];
		if (errors.length > 0) return this.#renderUserManagement(request, reply, errors, null, 400);

		const now = clock();
		const userId = await this.deps.registrations.createUser({
			username,
			// Mot de passe envoyé par e-mail : compte à valider à la première connexion (PUN_UNVERIFIED).
			groupId: random ? 0 : config.defaultUserGroup,
			passwordHash: punHash(password),
			email,
			emailSetting: 1,
			timezone: 0,
			dst: false,
			language: config.registration.defaultLang,
			style: config.defaultStyle,
			registeredAt: now,
			ip: request.ip,
		});
		await this.deps.phpCache?.invalidate('users_info');

		if (config.registration.report && config.registration.mailingList !== '') {
			const template = await this.deps.mailTemplates.load('new_user');
			const text = fillTemplate(template.body, {
				username,
				base_url: `${config.baseUrl}/`,
				profile_url: `${config.baseUrl}/profile.php?id=${userId}`,
				board_mailer: config.boardTitle,
			});
			await this.deps.mailer.send({ to: config.registration.mailingList, subject: template.subject, text }, config);
		}
		if (random) {
			const template = await this.deps.mailTemplates.load('welcome');
			const text = fillTemplate(template.body, {
				base_url: `${config.baseUrl}/`,
				username,
				password,
				login_url: `${config.baseUrl}/login.php`,
				board_mailer: config.boardTitle,
			});
			await this.deps.mailer.send({ to: email, subject: fillTemplate(template.subject, { board_title: config.boardTitle }), text }, config);
		}
		return reply.redirect('admin_loader.php?plugin=AMP_Gestion_utilisateurs.php&done=created', 303);
	}
}
