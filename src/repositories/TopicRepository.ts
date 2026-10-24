/**
 * Sujets : lecture avec les permissions du forum, localisation d'un message dans son sujet.
 */

import { sql } from 'kysely';
import type { Db } from '../db/database.ts';
import type { RecentTopic, Topic, TopicSort, TopicSummary } from '../domain/models.ts';
import { parseModerators } from '../services/phpSerialize.ts';

export interface PostLocation {
	topicId: number;
	/** Rang du message dans le sujet (1 = premier message). */
	position: number;
}

export interface TopicReader {
	/** Sujet lisible par le groupe donné (permissions de forum appliquées), ou null. */
	findReadable(topicId: number, groupId: number): Promise<Topic | null>;
	locatePost(postId: number): Promise<PostLocation | null>;
	findLastPostId(topicId: number): Promise<number | null>;
	/** Sujets lisibles par le groupe dont le dernier message est postérieur à `since` (index.php). */
	listUpdatedSince(groupId: number, since: number): Promise<RecentTopic[]>;
	/**
	 * Sujets d'une page de forum : épinglés d'abord, puis l'ordre du forum, puis id décroissant.
	 * @param dotUserId membre pour qui calculer « le point » (o_show_dot), ou null
	 */
	listForumPage(forumId: number, sort: TopicSort, offset: number, limit: number, dotUserId: number | null): Promise<TopicSummary[]>;
	/** Premier message posté après `since` (viewtopic.php?action=new), ou null. */
	findFirstPostAfter(topicId: number, since: number): Promise<number | null>;
}

export interface TopicWriter {
	/** num_views + 1 à chaque affichage d'un sujet (o_topic_views). */
	incrementViews(topicId: number): Promise<void>;
}

const SORT_COLUMNS = { lastPost: 't.last_post', posted: 't.posted', subject: 't.subject' } as const;

export class TopicRepository implements TopicReader, TopicWriter {
	constructor(private readonly db: Db) {}

	async findReadable(topicId: number, groupId: number): Promise<Topic | null> {
		const row = await this.db
			.selectFrom('topics as t')
			.innerJoin('forums as f', 'f.id', 't.forum_id')
			.leftJoin('forum_perms as fp', (join) => join.onRef('fp.forum_id', '=', 'f.id').on('fp.group_id', '=', groupId))
			.select([
				't.id',
				't.subject',
				't.closed',
				't.sticky',
				't.first_post_id',
				't.num_replies',
				'f.id as forum_id',
				'f.forum_name',
				'f.moderators',
				'fp.post_replies',
			])
			.where('t.id', '=', topicId)
			.where('t.moved_to', 'is', null)
			.where((eb) => eb.or([eb('fp.read_forum', 'is', null), eb('fp.read_forum', '=', 1)]))
			.executeTakeFirst();

		if (row === undefined) return null;

		return {
			id: row.id,
			subject: row.subject,
			closed: row.closed === 1,
			sticky: row.sticky === 1,
			firstPostId: row.first_post_id,
			numReplies: row.num_replies,
			forum: {
				id: row.forum_id,
				name: row.forum_name,
				moderators: parseModerators(row.moderators),
			},
			forumReplyPermission: row.post_replies === null ? null : row.post_replies === 1,
		};
	}

	async locatePost(postId: number): Promise<PostLocation | null> {
		const post = await this.db.selectFrom('posts').select(['topic_id', 'posted']).where('id', '=', postId).executeTakeFirst();

		if (post === undefined) return null;

		const { before } = await this.db
			.selectFrom('posts')
			.select(sql<number>`COUNT(id)`.as('before'))
			.where('topic_id', '=', post.topic_id)
			.where('posted', '<', post.posted)
			.executeTakeFirstOrThrow();

		return { topicId: post.topic_id, position: Number(before) + 1 };
	}

	async findLastPostId(topicId: number): Promise<number | null> {
		const row = await this.db
			.selectFrom('posts')
			.select((eb) => eb.fn.max('id').as('last_id'))
			.where('topic_id', '=', topicId)
			.executeTakeFirst();

		return row?.last_id ?? null;
	}

	async listUpdatedSince(groupId: number, since: number): Promise<RecentTopic[]> {
		const rows = await this.db
			.selectFrom('topics as t')
			.innerJoin('forums as f', 'f.id', 't.forum_id')
			.leftJoin('forum_perms as fp', (join) => join.onRef('fp.forum_id', '=', 'f.id').on('fp.group_id', '=', groupId))
			.select(['t.forum_id', 't.id', 't.last_post'])
			.where((eb) => eb.or([eb('fp.read_forum', 'is', null), eb('fp.read_forum', '=', 1)]))
			.where('t.last_post', '>', since)
			.where('t.moved_to', 'is', null)
			.execute();

		return rows.map((row) => ({ forumId: row.forum_id, topicId: row.id, lastPost: row.last_post }));
	}

	async listForumPage(forumId: number, sort: TopicSort, offset: number, limit: number, dotUserId: number | null): Promise<TopicSummary[]> {
		const rows = await this.db
			.selectFrom('topics as t')
			.select([
				't.id',
				't.poster',
				't.subject',
				't.posted',
				't.last_post',
				't.last_post_id',
				't.last_poster',
				't.num_views',
				't.num_replies',
				't.closed',
				't.sticky',
				't.moved_to',
			])
			// « Le point » : EXISTS plutôt que la jointure + GROUP BY du PHP, même résultat.
			.select((eb) =>
				(dotUserId !== null
					? eb.exists(eb.selectFrom('posts as p').select('p.id').whereRef('p.topic_id', '=', 't.id').where('p.poster_id', '=', dotUserId))
					: eb.val(false)
				).as('has_posted'),
			)
			.where('t.forum_id', '=', forumId)
			.orderBy('t.sticky', 'desc')
			.orderBy(SORT_COLUMNS[sort], sort === 'subject' ? 'asc' : 'desc')
			.orderBy('t.id', 'desc')
			.limit(limit)
			.offset(offset)
			.execute();

		return rows.map((row) => ({
			id: row.id,
			poster: row.poster,
			subject: row.subject,
			posted: row.posted,
			lastPost: row.last_post > 0 ? { postedAt: row.last_post, postId: row.last_post_id ?? 0, poster: row.last_poster ?? '' } : null,
			numViews: row.num_views,
			numReplies: row.num_replies,
			closed: row.closed === 1,
			sticky: row.sticky === 1,
			movedTo: row.moved_to !== null && row.moved_to !== 0 ? row.moved_to : null,
			hasPosted: Boolean(Number(row.has_posted)),
		}));
	}

	async findFirstPostAfter(topicId: number, since: number): Promise<number | null> {
		const row = await this.db
			.selectFrom('posts')
			.select((eb) => eb.fn.min('id').as('first_id'))
			.where('topic_id', '=', topicId)
			.where('posted', '>', since)
			.executeTakeFirst();
		return row?.first_id ?? null;
	}

	async incrementViews(topicId: number): Promise<void> {
		await this.db
			.updateTable('topics')
			.set((eb) => ({ num_views: eb('num_views', '+', 1) }))
			.where('id', '=', topicId)
			.execute();
	}
}
