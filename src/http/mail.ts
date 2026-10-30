/**
 * Envoi d'e-mails après la réponse (request.waitUntil) : une publication n’attend pas l'API
 * d'envoi, et un échec n'empêche ni la page ni les envois suivants ; il est noté dans le journal.
 */

import type { Mailer } from '../adapters/mailer.ts';
import type { BoardConfig } from '../domain/models.ts';
import type { MailMessage } from '../services/mail.ts';
import type { AppRequest } from './context.ts';

export function sendInBackground(request: AppRequest, mailer: Mailer, mails: readonly MailMessage[], config: BoardConfig): void {
	if (mails.length === 0) return;
	request.waitUntil(
		(async () => {
			for (const mail of mails) {
				try {
					await mailer.send(mail, config);
				} catch (error) {
					request.log.error({ err: error }, "Échec de l'envoi d'un e-mail");
				}
			}
		})(),
	);
}
