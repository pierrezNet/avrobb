/**
 * Envoi des e-mails (pun_mail()). Le Worker n'a ni SMTP ni sendmail : en attendant l'API HTTP du
 * lot 6 de TODO.md, les e-mails sont seulement notés dans le journal (destinataire et sujet, sans
 * le texte, qui peut contenir un lien personnel).
 */

import type { BoardConfig } from '../domain/models.ts';
import type { Logger } from '../http/context.ts';
import type { MailMessage } from '../services/mail.ts';

export interface Mailer {
	send(message: MailMessage, config: BoardConfig): Promise<void>;
}

export class LogMailer implements Mailer {
	constructor(private readonly logger: Logger) {}

	async send(message: MailMessage, _config: BoardConfig): Promise<void> {
		this.logger.info({ to: message.to, subject: message.subject }, 'E-mail non envoyé (pas encore de service d’envoi)');
	}
}
