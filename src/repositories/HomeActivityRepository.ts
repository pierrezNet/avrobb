/**
 * Activité de la semaine pour l'accueil (AvroBB) : discussions les plus commentées, dernière image
 * publiée dans une discussion, nouveaux membres, sujets actifs (répartition par projet). Les
 * permissions de forum (forum_perms) sont appliquées comme pour index.php.
 */

import type { Db } from '../db/database.ts';
import { forumReadable } from './forumPermissions.ts';

/** Groupe des comptes non validés (users.group_id = 0) : jamais affichés. */
const UNVERIFIED_GROUP = 0;

export interface HotTopic {
	id: number;
	subject: string;
	/** Messages publiés depuis `since`. */
	recentPosts: number;
	numReplies: number;
	lastPostAt: number;
}

export interface NewMember {
	id: number;
	username: string;
	registered: number;
}

export interface HomeActivityReader {
	/** Discussions lisibles qui ont reçu le plus de messages depuis `since`. */
	listHotTopics(groupId: number, since: number, limit: number): Promise<HotTopic[]>;
	/** Message le plus récent contenant une image, par discussion (texte BBCode brut). */
	findLatestImageMessages(topicIds: readonly number[]): Promise<Map<number, string>>;
	/** Membres inscrits depuis `since`, les plus récents d'abord. */
	listNewMembers(since: number, limit: number): Promise<NewMember[]>;
	/** Sujets des discussions lisibles actives depuis `since` (répartition par projet). */
	listActiveSubjects(groupId: number, since: number): Promise<string[]>;
}

export class HomeActivityRepository implements HomeActivityReader {
	constructor(private readonly db: Db) {}

	#readableTopics(groupId: number) {
		return this.db
			.selectFrom('topics as t')
			.innerJoin('forums as f', 'f.id', 't.forum_id')
			.leftJoin('forum_perms as fp', (join) => join.onRef('fp.forum_id', '=', 'f.id').on('fp.group_id', '=', groupId))
			.where(forumReadable)
			.where('t.moved_to', 'is', null);
	}

	async listHotTopics(groupId: number, since: number, limit: number): Promise<HotTopic[]> {
		const rows = await this.#readableTopics(groupId)
			.innerJoin('posts as p', 'p.topic_id', 't.id')
			.where('p.posted', '>=', since)
			.select(['t.id', 't.subject', 't.num_replies', 't.last_post'])
			.select((eb) => eb.fn.count<number>('p.id').as('recent'))
			.groupBy(['t.id', 't.subject', 't.num_replies', 't.last_post'])
			.orderBy('recent', 'desc')
			.orderBy('t.last_post', 'desc')
			.limit(limit)
			.execute();
		return rows.map((row) => ({
			id: row.id,
			subject: row.subject,
			recentPosts: Number(row.recent),
			numReplies: row.num_replies,
			lastPostAt: row.last_post,
		}));
	}

	async findLatestImageMessages(topicIds: readonly number[]): Promise<Map<number, string>> {
		const found = new Map<number, string>();
		for (const topicId of topicIds) {
			const row = await this.db
				.selectFrom('posts')
				.select('message')
				.where('topic_id', '=', topicId)
				.where('message', 'like', '%[img%')
				.orderBy('id', 'desc')
				.limit(1)
				.executeTakeFirst();
			if (row?.message) found.set(topicId, row.message);
		}
		return found;
	}

	async listNewMembers(since: number, limit: number): Promise<NewMember[]> {
		const rows = await this.db
			.selectFrom('users')
			.select(['id', 'username', 'registered'])
			.where('id', '>', 1)
			.where('group_id', '!=', UNVERIFIED_GROUP)
			.where('registered', '>=', since)
			.orderBy('registered', 'desc')
			.limit(limit)
			.execute();
		return rows.map((row) => ({ id: row.id, username: row.username, registered: row.registered }));
	}

	async listActiveSubjects(groupId: number, since: number): Promise<string[]> {
		const rows = await this.#readableTopics(groupId).where('t.last_post', '>=', since).select('t.subject').execute();
		return rows.map((row) => row.subject);
	}
}
