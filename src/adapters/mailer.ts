/**
 * Envoi des e-mails (pun_mail()) par l'API HTTP de Resend (comme donnetonpoint) : un Worker n'a ni
 * SMTP ni sendmail. Sans clé d'API (développement, ou service pas encore configuré), les e-mails
 * sont seulement notés dans le journal. Texte brut, comme les gabarits de FluxBB (lang/fr/mail.ts).
 */

import type { BoardConfig } from '../domain/models.ts';
import type { Logger } from '../http/context.ts';
import type { MailMessage } from '../services/mail.ts';

export interface Mailer {
	send(message: MailMessage, config: BoardConfig): Promise<void>;
}

/** Journal seulement : destinataire et sujet, sans le texte, qui peut contenir un lien personnel. */
export class LogMailer implements Mailer {
	constructor(private readonly logger: Logger) {}

	async send(message: MailMessage, _config: BoardConfig): Promise<void> {
		if (message.to === '') return;
		this.logger.info({ to: message.to, subject: message.subject }, 'E-mail non envoyé (pas de service d’envoi configuré)');
	}
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** Expéditeur : MAIL_FROM tel quel s'il porte un nom (« AvroBB <forum@…> »), sinon nommé d'après le forum. */
export function senderAddress(from: string, boardTitle: string): string {
	if (from.includes('<')) return from;
	const name = `${boardTitle} E-mail automatique`.replace(/["\\\r\n]/g, '');
	return `"${name}" <${from}>`;
}

export class ResendMailer implements Mailer {
	/**
	 * @param from adresse d'expédition d'un domaine vérifié chez Resend (MAIL_FROM)
	 * @param fetcher `fetch` enveloppé : appelé comme méthode, le `fetch` des Workers lève « Illegal invocation »
	 */
	constructor(
		private readonly apiKey: string,
		private readonly from: string,
		private readonly fetcher: Fetcher = (input, init) => fetch(input, init),
	) {}

	async send(message: MailMessage, config: BoardConfig): Promise<void> {
		// Adresse facultative dans le profil (comptes SSO) : rien à envoyer.
		if (message.to === '') return;
		const response = await this.fetcher(RESEND_ENDPOINT, {
			method: 'POST',
			headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
			body: JSON.stringify({
				from: senderAddress(this.from, config.boardTitle),
				to: [message.to],
				subject: message.subject,
				text: message.text,
				...(message.replyTo !== undefined && message.replyTo.email !== '' ? { reply_to: message.replyTo.email } : {}),
			}),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		// L'erreur porte le statut seulement : la réponse de l'API peut citer l'adresse du destinataire.
		if (!response.ok) throw new Error(`Resend : statut ${response.status}`);
	}
}
