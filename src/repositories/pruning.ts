/**
 * Élagage des sujets d'un forum (prune() d'include/common_admin.php) et des liens de redirection
 * orphelins, partagés par la suppression de catégories et de forums et par l'élagage de la maintenance.
 */

import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.ts';
import { stripSearchIndex } from './searchIndexSql.ts';

/**
 * prune() : supprime les sujets du forum (épinglés compris si `pruneSticky`, dernier message avant
 * `before` si donné), leurs abonnements et messages, et retire ces messages de l'index de recherche.
 * Comme le PHP, rien n'est supprimé si les sujets visés n'ont aucun message. Renvoie le nombre de sujets.
 */
export async function pruneForum(db: Kysely<Database>, forumId: number, pruneSticky: boolean, before: number | null): Promise<number> {
	let query = db.selectFrom('topics').select('id').where('forum_id', '=', forumId);
	if (before !== null) query = query.where('last_post', '<', before);
	if (!pruneSticky) query = query.where('sticky', '=', 0);
	const topicIds = (await query.execute()).map((row) => row.id);
	if (topicIds.length === 0) return 0;

	const postIds = (await db.selectFrom('posts').select('id').where('topic_id', 'in', topicIds).execute()).map((row) => row.id);
	if (postIds.length === 0) return 0;

	await db.deleteFrom('topics').where('id', 'in', topicIds).execute();
	await db.deleteFrom('topic_subscriptions').where('topic_id', 'in', topicIds).execute();
	await db.deleteFrom('posts').where('id', 'in', postIds).execute();
	await stripSearchIndex(db, postIds);
	return topicIds.length;
}

/** Liens de redirection dont le sujet cible n'existe plus. */
export async function deleteOrphanRedirects(db: Kysely<Database>): Promise<void> {
	const orphans = await db
		.selectFrom('topics as t1')
		.leftJoin('topics as t2', 't1.moved_to', 't2.id')
		.select('t1.id')
		.where('t2.id', 'is', null)
		.where('t1.moved_to', 'is not', null)
		.execute();
	if (orphans.length > 0)
		await db
			.deleteFrom('topics')
			.where(
				'id',
				'in',
				orphans.map((row) => row.id),
			)
			.execute();
}
