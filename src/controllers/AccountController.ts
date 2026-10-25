/**
 * Actions « mot de passe » et « adresse électronique » de profile.php : changement par formulaire,
 * et activation par le lien envoyé par e-mail (nouveau mot de passe de login.php?action=forget,
 * nouvelle adresse de action=change_email).
 *
 * Écarts assumés :
 * - l'ancien mot de passe est toujours demandé pour changer le sien, modérateur compris (le PHP
 *   ne le demandait pas aux modérateurs) ; il ne l'est pas pour celui d'un autre membre ;
 * - 6 caractères au moins, comme l'annonce le formulaire (le code PHP en acceptait 4) ;
 * - une clé d'activation n'active que ce qu'elle annonce : un hash pour un mot de passe, une
 *   adresse pour un e-mail (le PHP partageait activate_string entre les deux) ;
 * - les e-mails d'alerte nomment le titulaire du compte (le PHP y mettait le modérateur qui agit).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Mailer } from '../adapters/mailer.ts';
import type { LegacyCookieConfig } from '../config.ts';
import type { EditableProfile } from '../domain/models.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { setSessionCookie } from '../http/session.ts';
import { buildProfileMenu } from '../presenters/profileEditPage.ts';
import type { BanReader } from '../repositories/BanRepository.ts';
import type { MailTemplateName, MailTemplateReader } from '../repositories/MailTemplateFiles.ts';
import { punHash } from '../services/legacySession.ts';
import { fillTemplate, isValidEmail, randomPassword } from '../services/mail.ts';
import { checkPassword } from '../services/passwords.ts';
import { canChangeEmail, canChangePassword } from '../services/permissions.ts';
import { punTrim } from '../services/phpString.ts';
import { isBannedEmail, MIN_PASSWORD_LENGTH } from '../services/registration.ts';
import { positiveInt } from './params.ts';
import { isProfile, loadEditableProfile, type ProfileAccessDeps, type ProfileQuery } from './profileAccess.ts';

export interface AccountControllerDeps extends LayoutDeps, ProfileAccessDeps {
	bans: BanReader;
	mailTemplates: MailTemplateReader;
	mailer: Mailer;
	legacyCookie: LegacyCookieConfig;
}

type AccountRequest = FastifyRequest<{ Querystring: ProfileQuery; Body?: FormBody }>;

/** Clé d'activation reçue : 8 caractères alphanumériques (random_pass(8)). */
const sameKey = (sent: string | undefined, expected: string): boolean => sent !== undefined && sent !== '' && sent === expected;

export class AccountController {
	constructor(private readonly deps: AccountControllerDeps) {}

	// ——— Mot de passe ———

	passwordForm = async (request: AccountRequest, reply: FastifyReply): Promise<FastifyReply> => {
		if (request.query.key !== undefined) return this.activatePassword(request, reply);
		const profile = await loadEditableProfile(request, reply, this.deps, (p) => canChangePassword(request.viewer, p));
		if (!isProfile(profile)) return profile;
		return this.renderPassword(request, reply, profile, []);
	};

	changePassword = async (
		request: FastifyRequest<{ Querystring: ProfileQuery; Body: FormBody }>,
		reply: FastifyReply,
	): Promise<FastifyReply> => {
		const { viewer, body, board: config } = request;
		const { lang } = this.deps.page;
		const profile = await loadEditableProfile(request, reply, this.deps, (p) => canChangePassword(viewer, p));
		if (!isProfile(profile)) return profile;

		const own = viewer.id === profile.id;
		const password1 = punTrim(field(body, 'req_new_password1'));
		const password2 = punTrim(field(body, 'req_new_password2'));
		const errors: string[] = [];
		if (password1 !== password2) errors.push(lang.profile.passNotMatch);
		else if ([...password1].length < MIN_PASSWORD_LENGTH) errors.push(lang.profile.passTooShort);
		if (own) {
			const stored = (await this.deps.profileStore.findPasswordHash(profile.id)) ?? '';
			if (!checkPassword(punTrim(field(body, 'req_old_password')), stored).valid) errors.push(lang.profile.wrongPass);
		}
		if (errors.length > 0) return this.renderPassword(request, reply, profile, errors);

		const hash = punHash(password1);
		await this.deps.profileStore.setPassword(profile.id, hash);
		// Son propre mot de passe : le cookie doit porter le nouveau hash (pun_setcookie()).
		if (own) {
			const now = this.deps.page.clock();
			setSessionCookie(reply, this.deps, profile.id, hash, now + config.timeoutVisit, now, config.timeoutVisit);
		}
		return reply.redirect(`profile.php?section=essentials&id=${profile.id}&updated=1`, 303);
	};

	/** Lien de l'e-mail « mot de passe oublié » : réservé aux invités, comme le PHP. */
	private async activatePassword(request: AccountRequest, reply: FastifyReply): Promise<FastifyReply> {
		const { lang } = this.deps.page;
		if (!request.viewer.isGuest) return reply.redirect('index.php');
		const id = positiveInt(request.query.id);
		const pending = id > 1 ? await this.deps.profileStore.findPendingActivation(id) : null;
		if (pending === null || !sameKey(request.query.key, pending.key) || !/^[0-9a-f]{40}$/i.test(pending.value))
			return this.keyError(request, reply, lang.profile.passKeyBad);
		await this.deps.profileStore.activatePassword(id);
		return renderMessage(request, reply, this.deps, 200, lang.profile.passUpdated, { href: 'login.php', label: lang.common.login });
	}

	// ——— Adresse électronique ———

	emailForm = async (request: AccountRequest, reply: FastifyReply): Promise<FastifyReply> => {
		const profile = await loadEditableProfile(request, reply, this.deps, (p) => canChangeEmail(request.viewer, p));
		if (!isProfile(profile)) return profile;
		if (request.query.key !== undefined) return this.activateEmail(request, reply, profile);
		return this.renderEmail(request, reply, profile, [], '');
	};

	changeEmail = async (
		request: FastifyRequest<{ Querystring: ProfileQuery; Body: FormBody }>,
		reply: FastifyReply,
	): Promise<FastifyReply> => {
		const { viewer, body, board: config } = request;
		const { lang } = this.deps.page;
		const profile = await loadEditableProfile(request, reply, this.deps, (p) => canChangeEmail(viewer, p));
		if (!isProfile(profile)) return profile;

		const email = punTrim(field(body, 'req_new_email')).toLowerCase();
		// Le mot de passe demandé est celui du lecteur (modérateur compris), comme le PHP.
		const stored = (await this.deps.profileStore.findPasswordHash(viewer.id)) ?? '';
		if (!checkPassword(punTrim(field(body, 'req_password')), stored).valid)
			return this.renderEmail(request, reply, profile, [lang.profile.wrongCurrentPass], email);
		if (!isValidEmail(email) || email.length > 80)
			return this.renderEmail(request, reply, profile, [lang.profile.profileError({ kind: 'invalidEmail' })], email);

		const [bans, dupes] = await Promise.all([this.deps.bans.listBans(), this.deps.profileStore.listUsernamesByEmail(email, profile.id)]);
		const banned = isBannedEmail(email, bans);
		if (banned && !config.registration.allowBannedEmail)
			return this.renderEmail(request, reply, profile, [lang.profile.profileError({ kind: 'bannedEmail' })], email);
		if (dupes.length > 0 && !config.registration.allowDupeEmail)
			return this.renderEmail(request, reply, profile, [lang.profile.profileError({ kind: 'dupeEmail' })], email);

		const common = {
			username: profile.username,
			email,
			dupe_list: dupes.join(', '),
			profile_url: `${config.baseUrl}/profile.php?id=${profile.id}`,
			base_url: config.baseUrl,
			board_mailer: config.boardTitle,
		};
		const alerts: MailTemplateName[] = [
			...(banned ? (['banned_email_change'] as const) : []),
			...(dupes.length > 0 ? (['dupe_email_change'] as const) : []),
		];
		if (config.registration.mailingList !== '')
			for (const name of alerts) await this.send(name, config.registration.mailingList, common, request);

		const key = randomPassword(8);
		await this.deps.profileStore.setPendingEmail(profile.id, email, key);
		await this.send(
			'activate_email',
			email,
			{ ...common, activation_url: `${config.baseUrl}/profile.php?action=change_email&id=${profile.id}&key=${key}` },
			request,
		);
		return renderMessage(request, reply, this.deps, 200, lang.profile.activateEmailSent, {
			href: `mailto:${config.adminEmail}`,
			label: config.adminEmail,
		});
	};

	/** Lien de l'e-mail d'activation : le membre doit être identifié (l'e-mail le précise). */
	private async activateEmail(request: AccountRequest, reply: FastifyReply, profile: EditableProfile): Promise<FastifyReply> {
		const { lang } = this.deps.page;
		const pending = await this.deps.profileStore.findPendingActivation(profile.id);
		if (pending === null || !sameKey(request.query.key, pending.key) || !pending.value.includes('@'))
			return this.keyError(request, reply, lang.profile.emailKeyBad);
		await this.deps.profileStore.activateEmail(profile.id);
		return renderMessage(request, reply, this.deps, 200, lang.profile.emailUpdated, {
			href: `profile.php?section=essentials&id=${profile.id}`,
			label: lang.common.profile,
		});
	}

	private async send(name: MailTemplateName, to: string, values: Record<string, string>, request: FastifyRequest): Promise<void> {
		const template = await this.deps.mailTemplates.load(name);
		await this.deps.mailer.send(
			{ to, subject: fillTemplate(template.subject, values), text: fillTemplate(template.body, values) },
			request.board,
		);
	}

	private keyError(request: FastifyRequest, reply: FastifyReply, message: string): Promise<FastifyReply> {
		const email = request.board.adminEmail;
		return renderMessage(request, reply, this.deps, 400, message, { href: `mailto:${email}`, label: email });
	}

	private renderPassword(request: AccountRequest, reply: FastifyReply, profile: EditableProfile, errors: string[]): Promise<FastifyReply> {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		return renderPage(
			request,
			reply,
			this.deps,
			'profile_password.njk',
			{ pageId: 'profile', titleParts: [config.boardTitle, lang.common.profile, lang.profile.changePass], activeNav: 'profile' },
			{
				menu: buildProfileMenu(viewer, config, profile.id, 'essentials', lang),
				heading: lang.profile.sectionHeading(profile.username, lang.profile.changePass),
				formAction: `profile.php?action=change_pass&id=${profile.id}`,
				askOldPassword: viewer.id === profile.id,
				errors,
			},
		);
	}

	private renderEmail(
		request: AccountRequest,
		reply: FastifyReply,
		profile: EditableProfile,
		errors: string[],
		email: string,
	): Promise<FastifyReply> {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		return renderPage(
			request,
			reply,
			this.deps,
			'profile_email.njk',
			{ pageId: 'profile', titleParts: [config.boardTitle, lang.common.profile, lang.profile.changeEmail], activeNav: 'profile' },
			{
				menu: buildProfileMenu(viewer, config, profile.id, 'essentials', lang),
				heading: lang.profile.sectionHeading(profile.username, lang.profile.changeEmail),
				formAction: `profile.php?action=change_email&id=${profile.id}`,
				email,
				errors,
			},
		);
	}
}
