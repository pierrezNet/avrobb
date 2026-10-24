/**
 * Envoi des e-mails (pun_mail()) : SMTP si o_smtp_host est renseigné, comme le PHP ; sinon une boîte
 * de sortie en fichiers .eml (MAIL_OUTBOX, pour le développement et les tests) ou sendmail, l'équivalent
 * du mail() de PHP. L'expéditeur est « <titre> E-mail automatique » <o_webmaster_email>.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import type { BoardConfig } from '../domain/models.ts';
import type { MailMessage } from '../services/mail.ts';

export interface Mailer {
	send(message: MailMessage, config: BoardConfig): Promise<void>;
}

/** Réglages SMTP de l'administration (o_smtp_host « hôte[:port] », o_smtp_user, o_smtp_pass, o_smtp_ssl). */
export interface SmtpSettings {
	host: string;
	user: string;
	pass: string;
	ssl: boolean;
}

function transport(smtp: SmtpSettings, outbox: string | null): nodemailer.Transporter {
	if (smtp.host !== '') {
		const [host = smtp.host, port] = smtp.host.split(':');
		return nodemailer.createTransport({
			host,
			port: port !== undefined ? Number(port) : smtp.ssl ? 465 : 25,
			secure: smtp.ssl,
			...(smtp.user !== '' ? { auth: { user: smtp.user, pass: smtp.pass } } : {}),
		});
	}
	if (outbox !== null) return nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
	return nodemailer.createTransport({ sendmail: true });
}

export class NodeMailer implements Mailer {
	/** @param outbox dossier où écrire les e-mails quand aucun SMTP n'est configuré (développement) */
	constructor(private readonly outbox: string | null) {}

	async send(message: MailMessage, config: BoardConfig): Promise<void> {
		const info = await transport(config.smtp, this.outbox).sendMail({
			from: { name: `${config.boardTitle} E-mail automatique`, address: config.webmasterEmail },
			to: message.to,
			subject: message.subject,
			text: message.text,
			...(message.replyTo !== undefined ? { replyTo: { name: message.replyTo.name, address: message.replyTo.email } } : {}),
			headers: { 'X-Mailer': 'FluxBB Mailer' },
		});

		if (config.smtp.host === '' && this.outbox !== null && 'message' in info && Buffer.isBuffer(info.message)) {
			await mkdir(this.outbox, { recursive: true });
			await writeFile(path.join(this.outbox, `${Date.now()}-${message.to.replace(/[^\w.@-]/g, '_')}.eml`), info.message);
		}
	}
}
