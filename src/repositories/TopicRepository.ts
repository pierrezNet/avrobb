import { sql } from 'kysely';
import type { Db } from '../db/database.ts';
import type { Topic } from '../domain/models.ts';
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
}

export class TopicRepository implements TopicReader {
	constructor(private readonly db: Db) {}

	async findReadable(topicId: number, groupId: number): Promise<Topic | null> {
		const row = await this.db
			.selectFrom('topics as t')
			.innerJoin('forums as f', 'f.id', 't.forum_id')
			.leftJoin('forum_perms as fp', (join) => join
				.onRef('fp.forum_id', '=', 'f.id')
				.on('fp.group_id', '=', groupId))
			.select([
				't.id', 't.subject', 't.closed', 't.sticky', 't.first_post_id', 't.num_replies',
				'f.id as forum_id', 'f.forum_name', 'f.moderators', 'fp.post_replies',
			])
			.where('t.id', '=', topicId)
			.where('t.moved_to', 'is', null)
			.where((eb) => eb.or([eb('fp.read_forum', 'is', null), eb('fp.read_forum', '=', 1)]))
			.executeTakeFirst();

		if (row === undefined)
			return null;

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
		const post = await this.db
			.selectFrom('posts')
			.select(['topic_id', 'posted'])
			.where('id', '=', postId)
			.executeTakeFirst();

		if (post === undefined)
			return null;

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
}
