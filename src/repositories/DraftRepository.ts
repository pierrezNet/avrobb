/**
 * Brouillons de PV (table brouillons, draft_list.php, draft_edit.php) : enregistrement depuis
 * post.php, liste, lecture, modification et suppression par leur auteur.
 */

import type { Db } from '../db/database.ts';
import type { Draft } from '../domain/models.ts';

export interface NewDraft {
	poster: string;
	posterId: number;
	/** Sujet d'une nouvelle discussion ; null pour une réponse. */
	subject: string | null;
	message: string;
	posted: number;
	/** Sujet visé par une réponse ; null pour une nouvelle discussion. */
	topicId: number | null;
	forumId: number;
}

export interface DraftStore {
	create(draft: NewDraft): Promise<number>;
	/** Brouillons d'un membre, plus récents d'abord. */
	listByPoster(posterId: number): Promise<Draft[]>;
	find(id: number): Promise<Draft | null>;
	/** Nouveau texte (et nouveau sujet pour une nouvelle discussion). */
	update(id: number, changes: { subject: string | null; message: string }): Promise<void>;
	/** Supprime le brouillon s'il appartient à ce membre. */
	delete(id: number, posterId: number): Promise<void>;
}

export class DraftRepository implements DraftStore {
	constructor(private readonly db: Db) {}

	async create(draft: NewDraft): Promise<number> {
		const result = await this.db
			.insertInto('brouillons')
			.values({
				poster: draft.poster,
				poster_id: draft.posterId,
				subject: draft.subject,
				message: draft.message,
				posted: draft.posted,
				topic_id: draft.topicId ?? 0,
				forum_id: draft.forumId,
			})
			.executeTakeFirstOrThrow();
		return Number(result.insertId);
	}

	#select() {
		return this.db
			.selectFrom('brouillons as b')
			.leftJoin('topics as t', 't.id', 'b.topic_id')
			.leftJoin('forums as f', 'f.id', 'b.forum_id')
			.select([
				'b.id',
				'b.poster_id',
				'b.subject',
				'b.message',
				'b.posted',
				'b.topic_id',
				'b.forum_id',
				't.subject as topic_subject',
				'f.forum_name',
			]);
	}

	async listByPoster(posterId: number): Promise<Draft[]> {
		const rows = await this.#select().where('b.poster_id', '=', posterId).orderBy('b.posted', 'desc').execute();
		return rows.map(toDraft);
	}

	async find(id: number): Promise<Draft | null> {
		const row = await this.#select().where('b.id', '=', id).executeTakeFirst();
		return row !== undefined ? toDraft(row) : null;
	}

	async update(id: number, changes: { subject: string | null; message: string }): Promise<void> {
		await this.db
			.updateTable('brouillons')
			.set({ message: changes.message, ...(changes.subject !== null ? { subject: changes.subject } : {}) })
			.where('id', '=', id)
			.execute();
	}

	async delete(id: number, posterId: number): Promise<void> {
		await this.db.deleteFrom('brouillons').where('id', '=', id).where('poster_id', '=', posterId).execute();
	}
}

interface DraftRow {
	id: number;
	poster_id: number;
	subject: string | null;
	message: string | null;
	posted: number;
	topic_id: number;
	forum_id: number;
	topic_subject: string | null;
	forum_name: string | null;
}

/** Comme draft_list.php : un brouillon sans sujet propre est une réponse au sujet topic_id. */
function toDraft(row: DraftRow): Draft {
	const isReply = (row.subject ?? '') === '';
	return {
		id: row.id,
		posterId: row.poster_id,
		subject: isReply ? (row.topic_subject ?? '') : (row.subject ?? ''),
		message: row.message ?? '',
		posted: row.posted,
		topicId: isReply ? row.topic_id : null,
		forum: { id: row.forum_id, name: row.forum_name ?? '' },
	};
}
