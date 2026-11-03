/**
 * Envoi d'une notification push au service du navigateur (RFC 8030), chiffrée et signée VAPID.
 */

import type { Logger } from '../http/context.ts';
import type { PushMessage } from '../services/push.ts';
import { encryptPushPayload, vapidJwt } from './pushCrypto.ts';

export interface StoredPushSubscription {
	endpoint: string;
	p256dh: string;
	auth: string;
}

/** `gone` : abonnement expiré ou retiré par le navigateur, à effacer. */
export type PushResult = 'sent' | 'gone' | 'failed';

export interface PushSender {
	send(subscription: StoredPushSubscription, message: PushMessage): Promise<PushResult>;
}

export interface VapidKeys {
	publicKey: string;
	privateKey: JsonWebKey;
	subject: string;
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** Une notification non remise dans la journée n'a plus d'intérêt. */
const TTL_SECONDS = 86400;

export class WebPushSender implements PushSender {
	constructor(
		private readonly vapid: VapidKeys,
		private readonly clock: () => number,
		private readonly logger: Logger,
		private readonly fetcher: Fetcher = (input, init) => fetch(input, init),
	) {}

	async send(subscription: StoredPushSubscription, message: PushMessage): Promise<PushResult> {
		try {
			const body = await encryptPushPayload(JSON.stringify(message), subscription.p256dh, subscription.auth);
			const jwt = await vapidJwt(subscription.endpoint, this.vapid.subject, this.vapid.privateKey, this.clock());
			const response = await this.fetcher(subscription.endpoint, {
				method: 'POST',
				headers: {
					'Content-Encoding': 'aes128gcm',
					'Content-Type': 'application/octet-stream',
					Authorization: `vapid t=${jwt}, k=${this.vapid.publicKey}`,
					TTL: String(TTL_SECONDS),
					Urgency: 'normal',
				},
				body,
			});
			if (response.status === 404 || response.status === 410) return 'gone';
			if (!response.ok) {
				this.logger.error({ status: response.status, host: new URL(subscription.endpoint).host }, 'Notification push refusée');
				return 'failed';
			}
			return 'sent';
		} catch (error) {
			this.logger.error({ err: error }, 'Notification push non envoyée');
			return 'failed';
		}
	}
}
