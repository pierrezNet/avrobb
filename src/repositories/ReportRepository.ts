/**
 * Signalements de messages (table reports) : lien « nouveaux signalements » de l'en-tête, et
 * création d'un signalement (misc.php?report=…).
 */

import type { Db } from '../db/database.ts';
import { forumReadable } from './forumPermissions.ts';

export interface ReportReader {
	/** Reste-t-il des signalements non traités ? (lien « nouveaux signalements » de header.php) */
	hasPending(): Promise<boolean>;
}

/** Message signalé : son sujet et son forum. */
export interface ReportTarget {
	postId: number;
	topicId: number;
	subject: string;
	forumId: number;
	forumName: string;
}

export interface ReportWriter {
	/** Message lisible par le groupe, avec son sujet et son forum. */
	findTarget(postId: number, groupId: number): Promise<ReportTarget | null>;
	create(report: { target: ReportTarget; reportedBy: number; created: number; message: string }): Promise<void>;
}

export class ReportRepository implements ReportReader, ReportWriter {
	constructor(private readonly db: Db) {}

	async findTarget(postId: number, groupId: number): Promise<ReportTarget | null> {
		const row = await this.db
			.selectFrom('posts as p')
			.innerJoin('topics as t', 't.id', 'p.topic_id')
			.innerJoin('forums as f', 'f.id', 't.forum_id')
			.leftJoin('forum_perms as fp', (join) => join.onRef('fp.forum_id', '=', 'f.id').on('fp.group_id', '=', groupId))
			.select(['p.id', 't.id as topic_id', 't.subject', 'f.id as forum_id', 'f.forum_name'])
			.where('p.id', '=', postId)
			.where(forumReadable)
			.executeTakeFirst();
		return row !== undefined
			? { postId: row.id, topicId: row.topic_id, subject: row.subject, forumId: row.forum_id, forumName: row.forum_name }
			: null;
	}

	async create(report: { target: ReportTarget; reportedBy: number; created: number; message: string }): Promise<void> {
		await this.db
			.insertInto('reports')
			.values({
				post_id: report.target.postId,
				topic_id: report.target.topicId,
				forum_id: report.target.forumId,
				reported_by: report.reportedBy,
				created: report.created,
				message: report.message,
			})
			.execute();
	}

	async hasPending(): Promise<boolean> {
		const row = await this.db.selectFrom('reports').select('id').where('zapped', 'is', null).limit(1).executeTakeFirst();
		return row !== undefined;
	}
}
