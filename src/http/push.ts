/**
 * Notifications push après la réponse (request.waitUntil), comme les e-mails (http/mail.ts). Chaque
 * appareil reçoit le texte dans sa langue ; un abonnement expiré est effacé.
 */

import type { PushSender } from '../adapters/webPush.ts';
import type { PushKind, PushRecipient, PushSubscriptionStore } from '../repositories/PushSubscriptionRepository.ts';
import type { PushMessage, PushTexts } from '../services/push.ts';
import type { Locale } from '../services/routes.ts';
import type { AppRequest } from './context.ts';

export interface PushDeps {
	sender: PushSender;
	subscriptions: PushSubscriptionStore;
	/** Clé publique VAPID, donnée au navigateur pour s'abonner. */
	publicKey: string;
	texts: Readonly<Record<Locale, PushTexts>>;
}

export interface PushNotice {
	userId: number;
	message: (texts: PushTexts, locale: Locale) => PushMessage;
}

export function pushInBackground(request: AppRequest, push: PushDeps | null, kind: PushKind, notices: readonly PushNotice[]): void {
	if (push === null || notices.length === 0) return;
	request.waitUntil(
		(async () => {
			const byUser = new Map(notices.map((notice) => [notice.userId, notice]));
			let recipients: PushRecipient[];
			try {
				recipients = await push.subscriptions.listRecipients([...byUser.keys()], kind);
			} catch (error) {
				request.log.error({ err: error }, 'Abonnements push illisibles');
				return;
			}
			for (const recipient of recipients) {
				const notice = byUser.get(recipient.userId);
				if (notice === undefined) continue;
				const result = await push.sender.send(recipient, notice.message(push.texts[recipient.locale], recipient.locale));
				if (result === 'gone') await push.subscriptions.removeEndpoint(recipient.endpoint).catch(() => undefined);
			}
		})(),
	);
}
