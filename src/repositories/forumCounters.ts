/**
 * Compteurs et dernier message d'un forum : update_forum() de include/functions.php, appelé après
 * chaque écriture de message ou de sujet, dans la même transaction.
 */

import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.ts';

/** update_forum() : nombre de sujets et de messages, dernier message hors sujets déplacés. */
export async function updateForum(db: Kysely<Database>, forumId: number): Promise<void> {
	const counts = await db
		.selectFrom('topics')
		.select((eb) => [eb.fn.count<number>('id').as('topics'), eb.fn.sum<string | number | null>('num_replies').as('replies')])
		.where('forum_id', '=', forumId)
		.executeTakeFirstOrThrow();
	const numTopics = Number(counts.topics);
	// Les réponses seules ne comptent pas le message d'ouverture de chaque sujet.
	const numPosts = Number(counts.replies ?? 0) + numTopics;

	const last = await db
		.selectFrom('topics')
		.select(['last_post', 'last_post_id', 'last_poster'])
		.where('forum_id', '=', forumId)
		.where('moved_to', 'is', null)
		.orderBy('last_post', 'desc')
		.limit(1)
		.executeTakeFirst();

	await db
		.updateTable('forums')
		.set({
			num_topics: numTopics,
			num_posts: numPosts,
			last_post: last?.last_post ?? null,
			last_post_id: last?.last_post_id ?? null,
			last_poster: last?.last_poster ?? null,
		})
		.where('id', '=', forumId)
		.execute();
}
