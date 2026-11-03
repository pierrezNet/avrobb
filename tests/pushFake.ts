/**
 * Doublure des notifications push : abonnements en mémoire, envois enregistrés.
 */

import type { PushResult } from '../src/adapters/webPush.ts';
import type { PushDeps } from '../src/http/push.ts';
import { en } from '../src/lang/en/index.ts';
import { fr } from '../src/lang/fr/index.ts';
import type { PushKind, PushRecipient } from '../src/repositories/PushSubscriptionRepository.ts';
import type { PushMessage } from '../src/services/push.ts';

export interface FakePush {
	deps: PushDeps;
	sent: { endpoint: string; message: PushMessage }[];
	saved: string[];
	removed: string[];
}

/** `devices` : appareils abonnés ; `refused` : préférences désactivées (« 5:pm »). */
export function fakePush(devices: PushRecipient[] = [], options: { gone?: string[]; refused?: string[] } = {}): FakePush {
	const sent: FakePush['sent'] = [];
	const saved: string[] = [];
	const removed: string[] = [];
	const deps: PushDeps = {
		publicKey: 'BPublicKey',
		texts: { fr: fr.push, en: en.push },
		sender: {
			send: async (subscription, message): Promise<PushResult> => {
				sent.push({ endpoint: subscription.endpoint, message });
				return options.gone?.includes(subscription.endpoint) ? 'gone' : 'sent';
			},
		},
		subscriptions: {
			save: async (userId, subscription, locale) => void saved.push(`${userId} ${subscription.endpoint} ${locale}`),
			remove: async (userId, endpoint) => void removed.push(`${userId} ${endpoint}`),
			removeEndpoint: async (endpoint) => void removed.push(endpoint),
			listRecipients: async (userIds: readonly number[], kind: PushKind) =>
				devices.filter((device) => userIds.includes(device.userId) && !options.refused?.includes(`${device.userId}:${kind}`)),
		},
	};
	return { deps, sent, saved, removed };
}

export const device = (userId: number, locale: 'fr' | 'en' = 'fr'): PushRecipient => ({
	userId,
	endpoint: `https://fcm.googleapis.com/fcm/send/${userId}-${locale}`,
	p256dh: 'p'.repeat(20),
	auth: 'a'.repeat(20),
	locale,
});

/** Laisse finir les envois lancés après la réponse (waitUntil). */
export const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 10));
