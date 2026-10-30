/**
 * Compteurs et dernier message d'un forum : update_forum() de include/functions.php, à placer en fin
 * du lot de chaque écriture de message ou de sujet. Les valeurs sont des sous-requêtes, calculées
 * au moment où le lot s'exécute, donc après les écritures qui le précèdent.
 */

import type { Compilable, Db } from '../db/database.ts';

/** update_forum() : nombre de sujets et de messages, dernier message hors sujets déplacés. */
export function updateForumWrite(db: Db, forumId: number): Compilable {
	const lastTopic = () =>
		db.selectFrom('topics').where('forum_id', '=', forumId).where('moved_to', 'is', null).orderBy('last_post', 'desc').limit(1);
	return db
		.updateTable('forums')
		.set((eb) => ({
			num_topics: eb.selectFrom('topics').select(eb.fn.countAll<number>().as('n')).where('forum_id', '=', forumId),
			// Les réponses seules ne comptent pas le message d'ouverture de chaque sujet.
			num_posts: eb
				.selectFrom('topics')
				.select((sub) => sub(sub.fn.countAll<number>(), '+', sub.fn.coalesce(sub.fn.sum<number>('num_replies'), sub.val(0))).as('n'))
				.where('forum_id', '=', forumId),
			last_post: lastTopic().select('last_post'),
			last_post_id: lastTopic().select('last_post_id'),
			last_poster: lastTopic().select('last_poster'),
		}))
		.where('id', '=', forumId);
}
