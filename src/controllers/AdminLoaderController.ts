/**
 * Plugins d'administration (admin_loader.php?plugin=…). Portage progressif : les plugins portés sont
 * servis ici, les autres redirigés vers l'installation PHP. Droits d'admin_loader.php : AP_ pour les
 * administrateurs, AMP_ aussi pour les modérateurs.
 *
 * Portés : AMP_Gestion_utilisateurs.php (ajout d'utilisateur ; l'élagage, désactivé par PV — formulaire
 * sans bouton —, n'est pas repris).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Mailer } from '../adapters/mailer.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage } from '../http/layout.ts';
import { ADMIN_PLUGINS } from '../presenters/adminMenu.ts';
import type { BanReader } from '../repositories/BanRepository.ts';
import type { CensorReader } from '../repositories/CensorRepository.ts';
import type { MailTemplateReader } from '../repositories/MailTemplateFiles.ts';
import type { PhpCacheStore } from '../repositories/PhpCacheFiles.ts';
import type { RegistrationStore } from '../repositories/RegistrationRepository.ts';
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
		if (plugin !== 'AMP_Gestion_utilisateurs.php') return this.#toLegacy(request, reply);
		const done = request.query.done === 'created' ? this.deps.page.lang.adminPlugins.userManagement.created : null;
		return this.#renderUserManagement(request, reply, [], done);
	};

	submit = async (
		request: FastifyRequest<{ Querystring: AdminLoaderQuery; Body: FormBody }>,
		reply: FastifyReply,
	): Promise<FastifyReply> => {
		const plugin = await this.#plugin(request, reply);
		if (typeof plugin !== 'string') return plugin;
		if (plugin !== 'AMP_Gestion_utilisateurs.php' || field(request.body, 'add_user') === '')
			return renderMessage(request, reply, this.deps, 400, this.deps.page.lang.common.badRequest);
		return this.#addUser(request, reply);
	};

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
