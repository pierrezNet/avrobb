/**
 * Contrôleur de register.php : conditions d'utilisation, formulaire et création du compte, avec les
 * mêmes effets que le PHP (alertes à la liste d'administration, e-mail de bienvenue, cache des
 * statistiques, connexion immédiate).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Mailer } from '../adapters/mailer.ts';
import type { LegacyCookieConfig } from '../config.ts';
import type { BoardConfig } from '../domain/models.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { setSessionCookie } from '../http/session.ts';
import type { BanReader } from '../repositories/BanRepository.ts';
import type { CensorReader } from '../repositories/CensorRepository.ts';
import type { MailTemplateName, MailTemplateReader } from '../repositories/MailTemplateFiles.ts';
import type { PhpCacheStore } from '../repositories/PhpCacheFiles.ts';
import type { RegistrationStore } from '../repositories/RegistrationRepository.ts';
import { buildCensor } from '../services/censor.ts';
import { punHash } from '../services/legacySession.ts';
import { fillTemplate, randomPassword } from '../services/mail.ts';
import {
	checkUsername,
	isBannedEmail,
	type RegistrationValues,
	readRegistration,
	TIMEZONES,
	usernameSkeleton,
} from '../services/registration.ts';

export interface RegisterControllerDeps extends LayoutDeps {
	registrations: RegistrationStore;
	bans: BanReader;
	censorship: CensorReader;
	mailTemplates: MailTemplateReader;
	mailer: Mailer;
	phpCache: PhpCacheStore | null;
	legacyCookie: LegacyCookieConfig;
}

export interface RegisterQuery {
	action?: string;
	agree?: string;
	cancel?: string;
}

/** Une inscription par adresse IP et par heure (register.php). */
const REGISTRATION_FLOOD_SECONDS = 3600;

/** Valeurs du formulaire réaffichées après une erreur (jamais les mots de passe). */
interface FormState {
	username: string;
	email1: string;
	email2: string;
	timezone: number;
	dst: boolean;
	emailSetting: number;
}

export class RegisterController {
	constructor(private readonly deps: RegisterControllerDeps) {}

	show = async (request: FastifyRequest<{ Querystring: RegisterQuery }>, reply: FastifyReply): Promise<FastifyReply> => {
		const config = request.board;
		const { lang } = this.deps.page;

		if (!request.viewer.isGuest) return reply.redirect('index.php');
		if (!config.registrationsAllowed) return renderMessage(request, reply, this.deps, 200, lang.register.noNewRegs);
		if (request.query.cancel !== undefined) return reply.redirect('index.php');

		if (config.rules && request.query.agree === undefined)
			return renderPage(
				request,
				reply,
				this.deps,
				'register_rules.njk',
				{ pageId: 'register', titleParts: [config.boardTitle, lang.register.register, lang.register.forumRules], activeNav: 'register' },
				{ rulesHtml: config.rulesMessage },
			);

		const r = config.registration;
		return this.form(request, reply, [], {
			username: '',
			email1: '',
			email2: '',
			timezone: r.defaultTimezone,
			dst: r.defaultDst,
			emailSetting: r.defaultEmailSetting,
		});
	};

	submit = async (request: FastifyRequest<{ Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> => {
		const config = request.board;
		const { lang } = this.deps.page;
		const now = this.deps.page.clock();
		const body = request.body;

		if (!request.viewer.isGuest) return reply.redirect('index.php', 303);
		if (!config.registrationsAllowed) return renderMessage(request, reply, this.deps, 200, lang.register.noNewRegs);
		if (await this.deps.registrations.hasRecentRegistration(request.ip, now - REGISTRATION_FLOOD_SECONDS))
			return renderMessage(request, reply, this.deps, 429, lang.register.registrationFlood);

		const { values, errors: inputErrors } = readRegistration(
			{
				username: field(body, 'req_user'),
				password1: field(body, 'req_password1'),
				password2: field(body, 'req_password2'),
				email1: field(body, 'req_email1'),
				email2: field(body, 'req_email2'),
				timezone: field(body, 'timezone'),
				dst: field(body, 'dst') !== '',
				emailSetting: field(body, 'email_setting'),
			},
			{
				verifyEmail: config.registration.verify,
				defaultEmailSetting: config.registration.defaultEmailSetting,
				generatedPassword: randomPassword(8),
			},
		);

		const [bans, censoredWords, similar, dupes] = await Promise.all([
			this.deps.bans.listBans(),
			config.censoring ? this.deps.censorship.listWords() : [],
			this.deps.registrations.findSimilarUsername(values.username, usernameSkeleton(values.username)),
			this.deps.registrations.listUsernamesByEmail(values.email),
		]);

		const usernameErrors = checkUsername(values.username, lang.common.guest, bans, config.censoring ? buildCensor(censoredWords) : null);
		const bannedEmail = isBannedEmail(values.email, bans);
		// Ordre de check_username() : règle de forme, censure, pseudo déjà pris, pseudo banni.
		const errors = [
			...usernameErrors.filter((error) => error !== 'banned').map((error) => lang.register.errors[error]),
			...(similar !== null ? [lang.register.usernameDupe(similar)] : []),
			...usernameErrors.filter((error) => error === 'banned').map((error) => lang.register.errors[error]),
			...inputErrors.map((error) => lang.register.errors[error]),
			...(bannedEmail && !config.registration.allowBannedEmail ? [lang.register.bannedEmail] : []),
			...(dupes.length > 0 && !config.registration.allowDupeEmail ? [lang.register.dupeEmail] : []),
		];

		if (errors.length > 0)
			return this.form(request, reply, errors, {
				username: values.username,
				email1: values.email,
				email2: field(body, 'req_email2'),
				timezone: values.timezone,
				dst: values.dst,
				emailSetting: values.emailSetting,
			});

		const userId = await this.createAccount(request.ip, values, config, now);
		await this.alertAdministrators(values, userId, bannedEmail, dupes, config);

		if (config.registration.verify) {
			await this.sendWelcome(values, config);
			return renderMessage(request, reply, this.deps, 200, lang.register.regEmail, {
				href: `mailto:${config.adminEmail}`,
				label: config.adminEmail,
			});
		}

		// Nouveau membre : cache_users_info.php sera régénéré par le PHP.
		await this.deps.phpCache?.invalidate('users_info');
		setSessionCookie(reply, this.deps, userId, punHash(values.password), now + config.timeoutVisit, now, config.timeoutVisit);
		return reply.redirect('index.php', 303);
	};

	private form(request: FastifyRequest, reply: FastifyReply, errors: string[], state: FormState): Promise<FastifyReply> {
		const config = request.board;
		const { lang } = this.deps.page;
		return renderPage(
			request,
			reply,
			this.deps,
			'register.njk',
			{ pageId: 'register', titleParts: [config.boardTitle, lang.register.register], activeNav: 'register' },
			{
				errors,
				verify: config.registration.verify,
				state,
				timezones: TIMEZONES.map((value) => ({
					value,
					label: lang.register.timezones[String(value)] ?? String(value),
					selected: value === state.timezone,
				})),
				emailSettings: lang.register.emailSettings.map((label, value) => ({ value, label, checked: value === state.emailSetting })),
			},
		);
	}

	private createAccount(ip: string, values: RegistrationValues, config: BoardConfig, now: number): Promise<number> {
		return this.deps.registrations.createUser({
			username: values.username,
			// Adresse à vérifier : compte non validé (PUN_UNVERIFIED) jusqu'à la première connexion.
			groupId: config.registration.verify ? 0 : config.defaultUserGroup,
			passwordHash: punHash(values.password),
			email: values.email,
			emailSetting: values.emailSetting,
			timezone: values.timezone,
			dst: values.dst,
			language: config.registration.defaultLang,
			style: config.defaultStyle,
			registeredAt: now,
			ip,
		});
	}

	/** E-mails à o_mailing_list : adresse bannie, adresse déjà utilisée, nouvelle inscription (o_regs_report). */
	private async alertAdministrators(
		values: RegistrationValues,
		userId: number,
		bannedEmail: boolean,
		dupes: readonly string[],
		config: BoardConfig,
	): Promise<void> {
		const to = config.registration.mailingList;
		if (to === '') return;

		const common = {
			username: values.username,
			email: values.email,
			dupe_list: dupes.join(', '),
			profile_url: `${config.baseUrl}/profile.php?id=${userId}`,
			base_url: `${config.baseUrl}/`,
			board_mailer: config.boardTitle,
		};
		const alerts: MailTemplateName[] = [
			...(bannedEmail ? (['banned_email_register'] as const) : []),
			...(dupes.length > 0 ? (['dupe_email_register'] as const) : []),
			...(config.registration.report ? (['new_user'] as const) : []),
		];

		for (const name of alerts) {
			const template = await this.deps.mailTemplates.load(name);
			await this.deps.mailer.send({ to, subject: template.subject, text: fillTemplate(template.body, common) }, config);
		}
	}

	/** welcome.tpl avec le mot de passe tiré au sort (o_regs_verify). */
	private async sendWelcome(values: RegistrationValues, config: BoardConfig): Promise<void> {
		const template = await this.deps.mailTemplates.load('welcome');
		await this.deps.mailer.send(
			{
				to: values.email,
				subject: fillTemplate(template.subject, { board_title: config.boardTitle }),
				text: fillTemplate(template.body, {
					base_url: `${config.baseUrl}/`,
					username: values.username,
					password: values.password,
					login_url: `${config.baseUrl}/login.php`,
					board_mailer: config.boardTitle,
				}),
			},
			config,
		);
	}
}
