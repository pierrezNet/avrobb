/**
 * Signalements de messages (table reports) : lien « nouveaux signalements » de l'en-tête,
 * création d'un signalement (misc.php?report=…) et traitement (admin_reports.php).
 */

import type { Db } from '../db/database.ts';
import type { Report } from '../domain/models.ts';
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

export interface ReportStore {
	/** Signalements à traiter (les plus récents d'abord), ou les 10 derniers traités. */
	listReports(zapped: boolean): Promise<Report[]>;
	/** Marque un signalement comme traité, puis ne garde que les 10 plus récents traités (admin_reports.php). */
	zap(reportId: number, userId: number, now: number): Promise<void>;
}

/** Signalements traités conservés : au-delà, le PHP les supprime (ils ne s'affichent plus). */
const KEPT_ZAPPED = 10;

export class ReportRepository implements ReportReader, ReportWriter, ReportStore {
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

	async listReports(zapped: boolean): Promise<Report[]> {
		let query = this.db
			.selectFrom('reports as r')
			.leftJoin('posts as p', 'p.id', 'r.post_id')
			.leftJoin('topics as t', 't.id', 'r.topic_id')
			.leftJoin('forums as f', 'f.id', 'r.forum_id')
			.leftJoin('users as u', 'u.id', 'r.reported_by')
			.leftJoin('users as z', 'z.id', 'r.zapped_by')
			.select([
				'r.id',
				'r.created',
				'r.message',
				'r.reported_by',
				'r.topic_id',
				'r.forum_id',
				'r.zapped',
				'r.zapped_by',
				'p.id as pid',
				't.subject',
				'f.forum_name',
				'u.username as reporter',
				'z.username as zapper',
			]);
		query = zapped
			? query.where('r.zapped', 'is not', null).orderBy('r.zapped', 'desc').limit(KEPT_ZAPPED)
			: query.where('r.zapped', 'is', null).orderBy('r.created', 'desc');
		const rows = await query.execute();
		return rows.map((row) => ({
			id: row.id,
			created: row.created,
			message: row.message ?? '',
			reporter: row.reporter !== null ? { id: row.reported_by, username: row.reporter } : null,
			forum: row.forum_name !== null ? { id: row.forum_id, name: row.forum_name } : null,
			topic: row.subject !== null ? { id: row.topic_id, subject: row.subject } : null,
			postId: row.pid,
			zapped:
				row.zapped !== null
					? { at: row.zapped, by: row.zapper !== null && row.zapped_by !== null ? { id: row.zapped_by, username: row.zapper } : null }
					: null,
		}));
	}

	async zap(reportId: number, userId: number, now: number): Promise<void> {
		await this.db
			.updateTable('reports')
			.set({ zapped: now, zapped_by: userId })
			.where('id', '=', reportId)
			.where('zapped', 'is', null)
			.execute();
		const threshold = await this.db
			.selectFrom('reports')
			.select('zapped')
			.where('zapped', 'is not', null)
			.orderBy('zapped', 'desc')
			.limit(1)
			.offset(KEPT_ZAPPED)
			.executeTakeFirst();
		if (threshold?.zapped != null) await this.db.deleteFrom('reports').where('zapped', '<=', threshold.zapped).execute();
	}
}
