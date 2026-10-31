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
	// Un forum peut compter des milliers de sujets : sous-requêtes sur forum_id plutôt que des listes
	// d'identifiants, D1 refusant plus de 100 paramètres par requête. Les messages d'abord, tant que
	// leurs sujets existent ; seul l'index de recherche a besoin de leurs identifiants.
	const topicIds = db.selectFrom('topics').select('id').where('forum_id', 'in', forumIds);
	const postIds = (await db.selectFrom('posts').select('id').where('topic_id', 'in', topicIds).execute()).map((row) => row.id);

	return [
		...(await stripSearchIndexWrites(db, postIds)),
		db.deleteFrom('posts').where('topic_id', 'in', topicIds),
		db.deleteFrom('topic_subscriptions').where('topic_id', 'in', topicIds),
		db.deleteFrom('topics').where('forum_id', 'in', forumIds),
	];
}

/** Liens de redirection dont le sujet cible n'existe plus, évalués au moment où le lot s'exécute. */
export function orphanRedirectsDelete(db: Db): Compilable {
	return db
		.deleteFrom('topics')
		.where('moved_to', 'is not', null)
		.where('moved_to', 'not in', (eb) => eb.selectFrom('topics as target').select('target.id'));
}
