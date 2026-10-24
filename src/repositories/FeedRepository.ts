/**
 * Requêtes d'extern.php : sujet et messages d'un flux de discussion, derniers sujets d'un flux
 * général. Permissions par forum (forum_perms) appliquées comme en PHP.
 */

import type { Db } from '../db/database.ts';

export interface FeedPostRow {
	id: number;
	poster: string;
	posterId: number;
	message: string;
	hideSmilies: boolean;
	posted: number;
	/** E-mail public de l'auteur (email_setting = 0) ou e-mail saisi par un invité ; sinon null. */
	publicEmail: string | null;
}

export interface FeedTopicRow extends FeedPostRow {
	topicId: number;
	subject: string;
	topicPoster: string;
	topicPosted: number;
	lastPost: number;
	lastPoster: string;
}

export interface RecentTopicsQuery {
	groupId: number;
	forumIds: readonly number[];
	excludedForumIds: readonly number[];
	/** order=posted : sujets par date de création, avec leur premier message ; sinon le dernier. */
	orderPosted: boolean;
	limit: number;
}

export interface FeedReader {
	findTopic(topicId: number, groupId: number): Promise<{ subject: string; firstPostId: number } | null>;
	listTopicPosts(topicId: number, limit: number): Promise<FeedPostRow[]>;
	findForumName(forumId: number, groupId: number): Promise<string | null>;
	listRecentTopics(query: RecentTopicsQuery): Promise<FeedTopicRow[]>;
}

/** Adresse affichable dans le flux, comme extern.php : jamais pour une adresse masquée. */
function publicEmail(posterId: number, emailSetting: number, email: string, posterEmail: string | null): string | null {
	if (posterId > 1) return emailSetting === 0 ? email : null;
	return posterEmail !== null && posterEmail !== '' ? posterEmail : null;
}

export class FeedRepository implements FeedReader {
	constructor(private readonly db: Db) {}

	async findTopic(topicId: number, groupId: number): Promise<{ subject: string; firstPostId: number } | null> {
		const row = await this.db
			.selectFrom('topics as t')
			.leftJoin('forum_perms as fp', (join) => join.onRef('fp.forum_id', '=', 't.forum_id').on('fp.group_id', '=', groupId))
			.select(['t.subject', 't.first_post_id'])
			.where('t.id', '=', topicId)
			.where('t.moved_to', 'is', null)
			.where((eb) => eb.or([eb('fp.read_forum', 'is', null), eb('fp.read_forum', '=', 1)]))
			.executeTakeFirst();
		return row !== undefined ? { subject: row.subject, firstPostId: row.first_post_id } : null;
	}

	async listTopicPosts(topicId: number, limit: number): Promise<FeedPostRow[]> {
		const rows = await this.db
			.selectFrom('posts as p')
			.innerJoin('users as u', 'u.id', 'p.poster_id')
			.select([
				'p.id',
				'p.poster',
				'p.poster_id',
				'p.message',
				'p.hide_smilies',
				'p.posted',
				'p.poster_email',
				'u.email_setting',
				'u.email',
			])
			.where('p.topic_id', '=', topicId)
			.orderBy('p.posted', 'desc')
			.limit(limit)
			.execute();

		return rows.map((row) => ({
			id: row.id,
			poster: row.poster,
			posterId: row.poster_id,
			message: row.message ?? '',
			hideSmilies: row.hide_smilies === 1,
			posted: row.posted,
			publicEmail: publicEmail(row.poster_id, row.email_setting, row.email, row.poster_email),
		}));
	}

	async findForumName(forumId: number, groupId: number): Promise<string | null> {
		const row = await this.db
			.selectFrom('forums as f')
			.leftJoin('forum_perms as fp', (join) => join.onRef('fp.forum_id', '=', 'f.id').on('fp.group_id', '=', groupId))
			.select('f.forum_name')
			.where('f.id', '=', forumId)
			.where((eb) => eb.or([eb('fp.read_forum', 'is', null), eb('fp.read_forum', '=', 1)]))
			.executeTakeFirst();
		return row?.forum_name ?? null;
	}

	async listRecentTopics(query: RecentTopicsQuery): Promise<FeedTopicRow[]> {
		let select = this.db
			.selectFrom('topics as t')
			.innerJoin('posts as p', 'p.id', query.orderPosted ? 't.first_post_id' : 't.last_post_id')
			.innerJoin('users as u', 'u.id', 'p.poster_id')
			.leftJoin('forum_perms as fp', (join) => join.onRef('fp.forum_id', '=', 't.forum_id').on('fp.group_id', '=', query.groupId))
			.select([
				't.id as topic_id',
				't.poster as topic_poster',
				't.subject',
				't.posted as topic_posted',
				't.last_post',
				't.last_poster',
				'p.id',
				'p.poster',
				'p.poster_id',
				'p.message',
				'p.hide_smilies',
				'p.posted',
				'p.poster_email',
				'u.email_setting',
				'u.email',
			])
			.where((eb) => eb.or([eb('fp.read_forum', 'is', null), eb('fp.read_forum', '=', 1)]))
			.where('t.moved_to', 'is', null)
			.orderBy(query.orderPosted ? 't.posted' : 't.last_post', 'desc')
			.limit(query.limit);
		if (query.forumIds.length > 0) select = select.where('t.forum_id', 'in', query.forumIds);
		if (query.excludedForumIds.length > 0) select = select.where('t.forum_id', 'not in', query.excludedForumIds);

		const rows = await select.execute();
		return rows.map((row) => ({
			id: row.id,
			poster: row.poster,
			posterId: row.poster_id,
			message: row.message ?? '',
			hideSmilies: row.hide_smilies === 1,
			posted: row.posted,
			publicEmail: publicEmail(row.poster_id, row.email_setting, row.email, row.poster_email),
			topicId: row.topic_id,
			subject: row.subject,
			topicPoster: row.topic_poster,
			topicPosted: row.topic_posted,
			lastPost: row.last_post,
			lastPoster: row.last_poster ?? '',
		}));
	}
}
