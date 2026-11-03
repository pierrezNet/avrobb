/**
 * Abonnements aux notifications push (table push_subscriptions, migration 0010), un par appareil.
 */

import type { StoredPushSubscription } from '../adapters/webPush.ts';
import { chunks, ITEMS_PER_QUERY } from '../db/d1Dialect.ts';
import type { Db } from '../db/database.ts';
import type { PushSubscriptionInput } from '../services/push.ts';
import type { Locale } from '../services/routes.ts';

export interface PushRecipient extends StoredPushSubscription {
	userId: number;
	locale: Locale;
}

/** Préférence du membre qui autorise la notification. */
export type PushKind = 'pm' | 'replies';

export interface PushSubscriptionStore {
	/** Un appareil déjà abonné (même adresse) passe au membre connecté, dans la langue de la page. */
	save(userId: number, subscription: PushSubscriptionInput, locale: Locale, now: number): Promise<void>;
	remove(userId: number, endpoint: string): Promise<void>;
	removeEndpoint(endpoint: string): Promise<void>;
	/** Appareils des membres qui acceptent ce type de notification. */
	listRecipients(userIds: readonly number[], kind: PushKind): Promise<PushRecipient[]>;
}

export class PushSubscriptionRepository implements PushSubscriptionStore {
	constructor(private readonly db: Db) {}

	async save(userId: number, subscription: PushSubscriptionInput, locale: Locale, now: number): Promise<void> {
		await this.db
			.insertInto('push_subscriptions')
			.values({ user_id: userId, ...subscription, locale, created: now })
			.onConflict((conflict) =>
				conflict.column('endpoint').doUpdateSet({ user_id: userId, p256dh: subscription.p256dh, auth: subscription.auth, locale }),
			)
			.execute();
	}

	async remove(userId: number, endpoint: string): Promise<void> {
		await this.db.deleteFrom('push_subscriptions').where('user_id', '=', userId).where('endpoint', '=', endpoint).execute();
	}

	async removeEndpoint(endpoint: string): Promise<void> {
		await this.db.deleteFrom('push_subscriptions').where('endpoint', '=', endpoint).execute();
	}

	async listRecipients(userIds: readonly number[], kind: PushKind): Promise<PushRecipient[]> {
		const recipients: PushRecipient[] = [];
		for (const part of chunks([...new Set(userIds)], ITEMS_PER_QUERY)) {
			const rows = await this.db
				.selectFrom('push_subscriptions as s')
				.innerJoin('users as u', 'u.id', 's.user_id')
				.select(['s.user_id', 's.endpoint', 's.p256dh', 's.auth', 's.locale'])
				.where('s.user_id', 'in', part)
				.where(kind === 'pm' ? 'u.push_pm' : 'u.push_replies', '=', 1)
				.execute();
			for (const row of rows)
				recipients.push({
					userId: row.user_id,
					endpoint: row.endpoint,
					p256dh: row.p256dh,
					auth: row.auth,
					locale: row.locale === 'en' ? 'en' : 'fr',
				});
		}
		return recipients;
	}
}
