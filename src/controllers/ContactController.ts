/**
 * Contrôleur des formulaires de misc.php : e-mail à un membre (misc.php?email=…) et signalement
 * d'un message (misc.php?report=…), avec l'anti-flood du groupe.
 *
 * Écarts assumés : les erreurs réaffichent le formulaire au lieu d'une page de message (la saisie
 * n'est pas perdue) ; l'adresse de retour de l'e-mail est limitée aux pages du forum ; un
 * signalement exige de pouvoir lire le message (le PHP ne le vérifiait qu'à l'affichage).
 */

import type { Mailer } from '../adapters/mailer.ts';
import type { AppReply, AppRequest } from '../http/context.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildEmailPage, buildReportPage } from '../presenters/contactPage.ts';
import type { CensorReader } from '../repositories/CensorRepository.ts';
import type { ContactStore } from '../repositories/ContactRepository.ts';
import type { ReportTarget, ReportWriter } from '../repositories/ReportRepository.ts';
import { buildCensor } from '../services/censor.ts';
import { canEmailMember, validateEmail, validateReport } from '../services/contact.ts';
import type { MailTemplateReader } from '../services/mail.ts';
import { fillTemplate } from '../services/mail.ts';
import { isAnyModerator } from '../services/permissions.ts';
import { safeRedirect } from '../services/redirects.ts';
import { positiveInt } from './params.ts';

export interface ContactControllerDeps extends LayoutDeps {
	contacts: ContactStore;
	reportWriter: ReportWriter;
	censorship: CensorReader;
	mailTemplates: MailTemplateReader;
	mailer: Mailer;
}

export interface ContactQuery {
	email?: string;
	report?: string;
}

type ContactRequest = AppRequest<{ Querystring: ContactQuery; Body?: FormBody }>;

export class ContactController {
	constructor(private readonly deps: ContactControllerDeps) {}

	emailForm = async (request: ContactRequest, reply: AppReply): Promise<AppReply> => {
		const recipient = await this.resolveRecipient(request, reply);
		if (!('recipient' in recipient)) return recipient;
		// Retour sur la page d'où vient le visiteur, sinon le profil du destinataire (misc.php).
		const referer = request.headers.referer;
		const redirectUrl = referer !== undefined ? safeRedirect(referer, request.headers.host) : `profile.php?id=${recipient.id}`;
		return this.renderEmail(
			request,
			reply,
			recipient,
			redirectUrl === 'index.php' ? `profile.php?id=${recipient.id}` : redirectUrl,
			{ subject: '', message: '' },
			[],
		);
	};

	sendEmail = async (request: AppRequest<{ Querystring: ContactQuery; Body: FormBody }>, reply: AppReply): Promise<AppReply> => {
		const recipient = await this.resolveRecipient(request, reply);
		if (!('recipient' in recipient)) return recipient;
		const { viewer, board: config, body } = request;
		const now = this.deps.page.clock();
		const limits = await this.deps.contacts.findSenderLimits(viewer.id);
		const redirectUrl = safeRedirect(field(body, 'redirect_url'), request.headers.host);

		const { values, errors } = validateEmail(
			{ subject: field(body, 'req_subject'), message: field(body, 'req_message') },
			{ last: limits?.lastEmailSent ?? null, interval: limits?.emailFlood ?? 0 },
			now,
		);
		if (errors.length > 0)
			return this.renderEmail(request, reply, recipient, redirectUrl, values, errors.map(this.deps.page.lang.misc.emailErrors));

		const template = await this.deps.mailTemplates.load('form_email');
		await this.deps.mailer.send(
			{
				to: recipient.recipient.email,
				subject: fillTemplate(template.subject, { mail_subject: values.subject }),
				text: fillTemplate(template.body, {
					sender: viewer.username,
					board_title: config.boardTitle,
					mail_message: values.message,
					board_mailer: config.boardTitle,
				}),
				// Le destinataire répond directement à l'expéditeur.
				replyTo: { email: viewer.email, name: viewer.username },
			},
			config,
		);
		await this.deps.contacts.markEmailSent(viewer.id, now);
		return reply.redirect(redirectUrl, 303);
	};

	reportForm = async (request: ContactRequest, reply: AppReply): Promise<AppReply> => {
		const target = await this.resolveReportTarget(request, reply);
		if (!('postId' in target)) return target;
		return this.renderReport(request, reply, target, '', []);
	};

	sendReport = async (request: AppRequest<{ Querystring: ContactQuery; Body: FormBody }>, reply: AppReply): Promise<AppReply> => {
		const target = await this.resolveReportTarget(request, reply);
		if (!('postId' in target)) return target;
		const { viewer, board: config } = request;
		const now = this.deps.page.clock();
		const limits = await this.deps.contacts.findSenderLimits(viewer.id);

		const { reason, errors } = validateReport(
			field(request.body, 'req_reason'),
			{ last: limits?.lastReportSent ?? null, interval: limits?.reportFlood ?? 0 },
			now,
		);
		if (errors.length > 0) return this.renderReport(request, reply, target, reason, errors.map(this.deps.page.lang.misc.reportErrors));

		if (config.reportsByBoard) await this.deps.reportWriter.create({ target, reportedBy: viewer.id, created: now, message: reason });
		if (config.reportsByEmail && config.registration.mailingList !== '') {
			const template = await this.deps.mailTemplates.load('new_report');
			await this.deps.mailer.send(
				{
					to: config.registration.mailingList,
					subject: fillTemplate(template.subject, { forum_id: String(target.forumId), topic_subject: target.subject }),
					text: fillTemplate(template.body, {
						username: viewer.username,
						post_url: `${config.baseUrl}/viewtopic.php?pid=${target.postId}#p${target.postId}`,
						reason,
						board_mailer: config.boardTitle,
					}),
				},
				config,
			);
		}
		await this.deps.contacts.markReportSent(viewer.id, now);
		return reply.redirect(`viewforum.php?id=${target.forumId}`, 303);
	};

	/** Membre autorisé à envoyer des e-mails, destinataire existant qui accepte le formulaire. */
	private async resolveRecipient(request: ContactRequest, reply: AppReply) {
		const { viewer } = request;
		const { lang } = this.deps.page;
		if (viewer.isGuest || !viewer.group.canSendEmail) return renderMessage(request, reply, this.deps, 403, lang.common.noPermission);
		const id = positiveInt(request.query.email);
		const recipient = id > 1 ? await this.deps.contacts.findRecipient(id) : null;
		if (recipient === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
		if (!canEmailMember(recipient, isAnyModerator(viewer)))
			return renderMessage(request, reply, this.deps, 403, lang.misc.formEmailDisabled);
		return { id, recipient };
	}

	private async resolveReportTarget(request: ContactRequest, reply: AppReply): Promise<ReportTarget | AppReply> {
		const { viewer } = request;
		const { lang } = this.deps.page;
		if (viewer.isGuest) return renderMessage(request, reply, this.deps, 403, lang.common.noPermission);
		const id = positiveInt(request.query.report);
		const target = id > 0 ? await this.deps.reportWriter.findTarget(id, viewer.group.id) : null;
		if (target === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
		return target;
	}

	private renderEmail(
		request: ContactRequest,
		reply: AppReply,
		recipient: { id: number; recipient: { username: string } },
		redirectUrl: string,
		form: { subject: string; message: string },
		errors: string[],
	): Promise<AppReply> {
		const { lang } = this.deps.page;
		const view = buildEmailPage({
			recipientId: recipient.id,
			recipientName: recipient.recipient.username,
			redirectUrl,
			form,
			errors,
			lang,
		});
		return renderPage(
			request,
			reply,
			this.deps,
			'misc_email.njk',
			{ pageId: 'misc', titleParts: [request.board.boardTitle, view.title] },
			view,
		);
	}

	private async renderReport(
		request: ContactRequest,
		reply: AppReply,
		target: ReportTarget,
		reason: string,
		errors: string[],
	): Promise<AppReply> {
		const { board: config } = request;
		const { lang } = this.deps.page;
		const censor = config.censoring ? buildCensor(await this.deps.censorship.listWords()) : null;
		const view = buildReportPage({ target, reason, errors, censor, lang });
		return renderPage(
			request,
			reply,
			this.deps,
			'misc_report.njk',
			{ pageId: 'misc', titleParts: [config.boardTitle, lang.misc.reportPost] },
			view,
		);
	}
}
