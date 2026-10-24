/**
 * Abonnements aux sujets et aux forums (misc.php?action=subscribe|unsubscribe) : tables
 * topic_subscriptions et forum_subscriptions.
 */

import type { Db } from '../db/database.ts';
import { forumReadable } from './forumPermissions.ts';

export type SubscriptionTarget = { kind: 'topic'; id: number } | { kind: 'forum'; id: number };

export interface SubscriptionStore {
	/** Sujet (non déplacé) ou forum lisible par le groupe. */
	isReadable(target: SubscriptionTarget, groupId: number): Promise<boolean>;
	isSubscribed(target: SubscriptionTarget, userId: number): Promise<boolean>;
	subscribe(target: SubscriptionTarget, userId: number): Promise<void>;
	unsubscribe(target: SubscriptionTarget, userId: number): Promise<void>;
}

export class SubscriptionRepository implements SubscriptionStore {
	constructor(private readonly db: Db) {}

	async isReadable(target: SubscriptionTarget, groupId: number): Promise<boolean> {
		const row =
			target.kind === 'topic'
				? await this.db
						.selectFrom('topics as t')
						.leftJoin('forum_perms as fp', (join) => join.onRef('fp.forum_id', '=', 't.forum_id').on('fp.group_id', '=', groupId))
						.select('t.id')
						.where('t.id', '=', target.id)
						.where('t.moved_to', 'is', null)
						.where(forumReadable)
						.executeTakeFirst()
				: await this.db
						.selectFrom('forums as f')
						.leftJoin('forum_perms as fp', (join) => join.onRef('fp.forum_id', '=', 'f.id').on('fp.group_id', '=', groupId))
						.select('f.id')
						.where('f.id', '=', target.id)
						.where(forumReadable)
						.executeTakeFirst();
		return row !== undefined;
	}

	async isSubscribed(target: SubscriptionTarget, userId: number): Promise<boolean> {
		const row =
			target.kind === 'topic'
				? await this.db
						.selectFrom('topic_subscriptions')
						.select('user_id')
						.where('user_id', '=', userId)
						.where('topic_id', '=', target.id)
						.executeTakeFirst()
				: await this.db
						.selectFrom('forum_subscriptions')
						.select('user_id')
						.where('user_id', '=', userId)
						.where('forum_id', '=', target.id)
						.executeTakeFirst();
		return row !== undefined;
	}

	async subscribe(target: SubscriptionTarget, userId: number): Promise<void> {
		if (target.kind === 'topic') await this.db.insertInto('topic_subscriptions').values({ user_id: userId, topic_id: target.id }).execute();
		else await this.db.insertInto('forum_subscriptions').values({ user_id: userId, forum_id: target.id }).execute();
	}

	async unsubscribe(target: SubscriptionTarget, userId: number): Promise<void> {
		if (target.kind === 'topic')
			await this.db.deleteFrom('topic_subscriptions').where('user_id', '=', userId).where('topic_id', '=', target.id).execute();
		else await this.db.deleteFrom('forum_subscriptions').where('user_id', '=', userId).where('forum_id', '=', target.id).execute();
	}
}
