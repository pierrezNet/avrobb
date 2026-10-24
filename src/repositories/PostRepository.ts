/**
 * Messages d'un sujet, avec leur auteur, son groupe et sa présence en ligne (requête de viewtopic.php).
 */

import type { Db } from '../db/database.ts';
import { GUEST_USER_ID, type Post } from '../domain/models.ts';

export interface PostReader {
	/** Messages d'un sujet, dans l'ordre, avec leur auteur et son statut en ligne. */
	listPage(topicId: number, offset: number, limit: number): Promise<Post[]>;
}

export class PostRepository implements PostReader {
	constructor(private readonly db: Db) {}

	async listPage(topicId: number, offset: number, limit: number): Promise<Post[]> {
		const rows = await this.db
			.selectFrom('posts as p')
			.innerJoin('users as u', 'u.id', 'p.poster_id')
			.innerJoin('groups as g', 'g.g_id', 'u.group_id')
			.leftJoin('online as o', (join) => join.onRef('o.user_id', '=', 'u.id').on('o.user_id', '!=', GUEST_USER_ID).on('o.idle', '=', 0))
			.select([
				'p.id',
				'p.poster',
				'p.poster_id',
				'p.poster_ip',
				'p.poster_email',
				'p.message',
				'p.hide_smilies',
				'p.posted',
				'p.edited',
				'p.edited_by',
				'u.email',
				'u.title',
				'u.url',
				'u.location',
				'u.signature',
				'u.email_setting',
				'u.num_posts',
				'u.registered',
				'u.admin_note',
				'u.use_pm',
				'u.rep_plus',
				'u.rep_minus',
				'u.reputation_enable',
				'g.g_pm',
				'g.g_id',
				'g.g_user_title',
				'o.user_id as online_user_id',
			])
			.where('p.topic_id', '=', topicId)
			.orderBy('p.id')
			.limit(limit)
			.offset(offset)
			.execute();

		return rows.map((row) => ({
			id: row.id,
			username: row.poster,
			posterIp: row.poster_ip ?? '',
			posterEmail: row.poster_email ?? '',
			message: row.message ?? '',
			hideSmilies: row.hide_smilies === 1,
			posted: row.posted,
			edited: row.edited,
			editedBy: row.edited_by ?? '',
			author:
				row.poster_id === GUEST_USER_ID
					? null
					: {
							id: row.poster_id,
							email: row.email,
							title: row.title ?? '',
							url: row.url ?? '',
							location: row.location ?? '',
							signature: row.signature ?? '',
							emailSetting: row.email_setting,
							numPosts: row.num_posts,
							registered: row.registered,
							adminNote: row.admin_note ?? '',
							groupId: row.g_id,
							groupUserTitle: row.g_user_title ?? '',
							isOnline: row.online_user_id === row.poster_id,
							acceptsPrivateMessages: row.use_pm === 1 && row.g_pm === 1,
							reputationPlus: row.rep_plus,
							reputationMinus: row.rep_minus,
							reputationEnabled: row.reputation_enable === 1,
						},
		}));
	}
}
