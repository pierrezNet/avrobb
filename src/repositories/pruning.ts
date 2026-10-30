/**
 * Élagage des sujets de forums (prune() d'include/common_admin.php) et des liens de redirection
 * orphelins, pour la suppression de catégories et de forums. Les lectures sont faites ici, les
 * écritures renvoyées pour le lot atomique de l'appelant (database.ts, batch()).
 */

import type { Compilable, Db } from '../db/database.ts';
import { stripSearchIndexWrites } from './searchIndexSql.ts';

/**
 * prune() pour tous les sujets de ces forums (épinglés compris) : sujets, abonnements, messages et
 * entrées de l'index de recherche. L'index est nettoyé en une fois, pour que les mots partagés
 * entre ces forums soient comptés ensemble.
 */
export async function pruneForumsWrites(db: Db, forumIds: readonly number[]): Promise<Compilable[]> {
	if (forumIds.length === 0) return [];
	const topicIds = (await db.selectFrom('topics').select('id').where('forum_id', 'in', forumIds).execute()).map((row) => row.id);
	if (topicIds.length === 0) return [];
	const postIds = (await db.selectFrom('posts').select('id').where('topic_id', 'in', topicIds).execute()).map((row) => row.id);

	return [
		db.deleteFrom('topics').where('id', 'in', topicIds),
		db.deleteFrom('topic_subscriptions').where('topic_id', 'in', topicIds),
		...(postIds.length > 0 ? [db.deleteFrom('posts').where('id', 'in', postIds)] : []),
		...(await stripSearchIndexWrites(db, postIds)),
	];
}

/** Liens de redirection dont le sujet cible n'existe plus, évalués au moment où le lot s'exécute. */
export function orphanRedirectsDelete(db: Db): Compilable {
	return db
		.deleteFrom('topics')
		.where('moved_to', 'is not', null)
		.where('moved_to', 'not in', (eb) => eb.selectFrom('topics as target').select('target.id'));
}
