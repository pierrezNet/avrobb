/**
 * Plugin « Gestion d'utilisateur » (AMP_Gestion_utilisateurs.php) : ajout d'un compte avec les contrôles
 * de register.php. L'élagage, désactivé par PV (formulaire sans bouton), n'est pas repris.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type FormBody, field } from '../../http/forms.ts';
import { renderMessage } from '../../http/layout.ts';
import { buildCensor } from '../../services/censor.ts';
import { punHash } from '../../services/legacySession.ts';
import { fillTemplate, isValidEmail, randomPassword } from '../../services/mail.ts';
import { checkUsername, MIN_PASSWORD_LENGTH, normalizeUsername, usernameSkeleton } from '../../services/registration.ts';
import { renderAdminPage } from '../adminPage.ts';
import type { AdminLoaderControllerDeps, AdminLoaderQuery, PluginHandler } from './pluginPage.ts';

export class UserManagementPlugin implements PluginHandler {
	constructor(private readonly deps: AdminLoaderControllerDeps) {}

	show(request: FastifyRequest<{ Querystring: AdminLoaderQuery }>, reply: FastifyReply): Promise<FastifyReply> {
		const done = request.query.done === 'created' ? this.deps.page.lang.adminPlugins.userManagement.created : null;
		return this.#renderUserManagement(request, reply, [], done);
	}

	submit(request: FastifyRequest<{ Querystring: AdminLoaderQuery; Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> {
		if (field(request.body, 'add_user') !== '') return this.#addUser(request, reply);
		return renderMessage(request, reply, this.deps, 400, this.deps.page.lang.common.badRequest);
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
