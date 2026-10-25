/**
 * Mot de passe oublié (login.php?action=forget) : envoi d'un nouveau mot de passe et d'un lien
 * d'activation (profile.php?action=change_pass, AccountController, qui finalise le changement).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Mailer } from '../adapters/mailer.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import type { MailTemplateReader } from '../repositories/MailTemplateFiles.ts';
import type { PasswordResetStore } from '../repositories/UserRepository.ts';
import { punHash } from '../services/legacySession.ts';
import { fillTemplate, isValidEmail, randomPassword } from '../services/mail.ts';

export interface PasswordResetControllerDeps extends LayoutDeps {
	passwordResets: PasswordResetStore;
	mailTemplates: MailTemplateReader;
	mailer: Mailer;
}

/** Un seul e-mail de réinitialisation par heure et par compte (login.php). */
const EMAIL_FLOOD_SECONDS = 3600;

export class PasswordResetController {
	constructor(private readonly deps: PasswordResetControllerDeps) {}

	form = async (request: FastifyRequest, reply: FastifyReply, errors: string[] = []): Promise<FastifyReply> => {
		if (!request.viewer.isGuest) return reply.redirect('index.php');
		const { lang } = this.deps.page;
		return renderPage(
			request,
			reply,
			this.deps,
			'request_pass.njk',
			{ pageId: 'login', titleParts: [request.board.boardTitle, lang.login.requestPass], activeNav: 'login' },
			{ errors },
		);
	};

	submit = async (request: FastifyRequest<{ Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> => {
		if (!request.viewer.isGuest) return reply.redirect('index.php', 303);

		const { lang } = this.deps.page;
		const config = request.board;
		const now = this.deps.page.clock();
		const email = field(request.body, 'req_email').trim().toLowerCase();

		if (!isValidEmail(email)) return this.form(request, reply, [lang.login.invalidEmail]);

		const accounts = await this.deps.passwordResets.findByEmail(email);
		if (accounts.length === 0) return this.form(request, reply, [lang.login.noEmailMatch(email)]);

		const template = await this.deps.mailTemplates.load('activate_password');
		const common = { base_url: `${config.baseUrl}/`, board_mailer: config.boardTitle };

		for (const account of accounts) {
			const elapsed = account.lastEmailSent !== null ? now - account.lastEmailSent : null;
			if (elapsed !== null && elapsed >= 0 && elapsed < EMAIL_FLOOD_SECONDS)
				return renderMessage(request, reply, this.deps, 429, lang.login.emailFlood(Math.trunc((EMAIL_FLOOD_SECONDS - elapsed) / 60)));

			const password = randomPassword(8);
			const key = randomPassword(8);
			await this.deps.passwordResets.setPendingPassword(account.id, punHash(password), key, now);
			await this.deps.mailer.send(
				{
					to: email,
					subject: template.subject,
					text: fillTemplate(template.body, {
						...common,
						username: account.username,
						activation_url: `${config.baseUrl}/profile.php?id=${account.id}&action=change_pass&key=${key}`,
						new_password: password,
					}),
				},
				config,
			);
		}

		return renderMessage(request, reply, this.deps, 200, lang.login.forgetMail, {
			href: `mailto:${config.adminEmail}`,
			label: config.adminEmail,
		});
	};
}
