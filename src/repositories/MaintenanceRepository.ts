/**
 * Maintenance du forum (admin_maintenance.php) : reconstruction de l'index de recherche par lots et
 * élagage des anciennes discussions.
 */

import { sql } from 'kysely';
import type { Db } from '../db/database.ts';
import type { IndexedWords } from '../services/searchIndex.ts';
import { updateForum } from './forumCounters.ts';
import { deleteOrphanRedirects, pruneForum } from './pruning.ts';
import { updateSearchIndex } from './searchIndexSql.ts';
import { inTransaction } from './transactions.ts';

export interface PostToIndex {
	id: number;
	message: string;
	/** Sujet de la discussion si c'est son premier message (indexé avec), sinon null. */
	subject: string | null;
}

export interface MaintenanceStore {
	firstPostId(): Promise<number>;
	/** Vide search_matches et search_words et remet la numérotation des mots à 1. */
	emptySearchIndex(): Promise<void>;
	/** Messages à partir de `startAt` (inclus), par identifiant croissant. */
	postsToIndex(startAt: number, limit: number): Promise<PostToIndex[]>;
	indexPost(postId: number, words: IndexedWords): Promise<void>;
	/** Premier message après `postId`, ou null s'il n'y en a plus. */
	nextPostId(postId: number): Promise<number | null>;
	/** Discussions (hors liens de redirection) dont le dernier message est antérieur à `before`. */
	countPrunable(before: number, withSticky: boolean, forumId: number | null): Promise<number>;
	/** prune() puis update_forum() sur un forum ou tous, et suppression des redirections orphelines. */
	prune(before: number | null, withSticky: boolean, forumId: number | null): Promise<void>;
}

export class MaintenanceRepository implements MaintenanceStore {
	constructor(private readonly db: Db) {}

	async firstPostId(): Promise<number> {
		const row = await this.db
			.selectFrom('posts')
			.select((eb) => eb.fn.min('id').as('first'))
			.executeTakeFirst();
		return Number(row?.first ?? 0);
	}

	async emptySearchIndex(): Promise<void> {
		await this.db.deleteFrom('search_matches').execute();
		await this.db.deleteFrom('search_words').execute();
		await sql`ALTER TABLE ${sql.table('search_words')} AUTO_INCREMENT = 1`.execute(this.db);
	}

	async postsToIndex(startAt: number, limit: number): Promise<PostToIndex[]> {
		const rows = await this.db
			.selectFrom('posts as p')
			.innerJoin('topics as t', 't.id', 'p.topic_id')
			.select(['p.id', 'p.message', 't.subject', 't.first_post_id'])
			.where('p.id', '>=', startAt)
			.orderBy('p.id')
			.limit(limit)
			.execute();
		return rows.map((row) => ({ id: row.id, message: row.message ?? '', subject: row.id === row.first_post_id ? row.subject : null }));
	}

	async indexPost(postId: number, words: IndexedWords): Promise<void> {
		await inTransaction(this.db, (trx) => updateSearchIndex(trx, 'post', postId, words));
	}

	async nextPostId(postId: number): Promise<number | null> {
		const row = await this.db.selectFrom('posts').select('id').where('id', '>', postId).orderBy('id').limit(1).executeTakeFirst();
		return row?.id ?? null;
	}

	async countPrunable(before: number, withSticky: boolean, forumId: number | null): Promise<number> {
		let query = this.db
			.selectFrom('topics')
			.select((eb) => eb.fn.count<number>('id').as('total'))
			.where('last_post', '<', before)
			.where('moved_to', 'is', null);
		if (!withSticky) query = query.where('sticky', '=', 0);
		if (forumId !== null) query = query.where('forum_id', '=', forumId);
		return Number((await query.executeTakeFirstOrThrow()).total);
	}

	async prune(before: number | null, withSticky: boolean, forumId: number | null): Promise<void> {
		await inTransaction(this.db, async (trx) => {
			const forums = forumId !== null ? [{ id: forumId }] : await trx.selectFrom('forums').select('id').execute();
			for (const forum of forums) {
				await pruneForum(trx, forum.id, withSticky, before);
				await updateForum(trx, forum.id);
			}
			await deleteOrphanRedirects(trx);
		});
	}
}
