/**
 * Forums et catégories : liste de l'index et liste « Atteindre » du pied de page
 * (generate_quickjump_cache()). Les permissions par forum (forum_perms) sont appliquées ici.
 */

import type { Db } from '../db/database.ts';
import type { ForumCategory, IndexCategory } from '../domain/models.ts';
import { parseModerators } from '../services/phpSerialize.ts';

export interface ForumReader {
	/** Catégories et forums lisibles par le groupe, dans l'ordre d'affichage. */
	listReadable(groupId: number): Promise<ForumCategory[]>;
	/** Catégories et forums lisibles, avec compteurs et dernier message (requête de index.php). */
	listIndex(groupId: number): Promise<IndexCategory[]>;
}

/** Regroupe des lignes triées par catégorie. */
function groupByCategory<Row extends { cid: number; cat_name: string }, Item>(rows: readonly Row[], toItem: (row: Row) => Item) {
	const categories: { id: number; name: string; forums: Item[] }[] = [];
	for (const row of rows) {
		let category = categories.at(-1);
		if (category?.id !== row.cid) {
			category = { id: row.cid, name: row.cat_name, forums: [] };
			categories.push(category);
		}
		category.forums.push(toItem(row));
	}
	return categories;
}

export class ForumRepository implements ForumReader {
	constructor(private readonly db: Db) {}

	/** Forums lisibles par le groupe, dans l'ordre d'affichage (catégorie, puis forum). */
	#readableForums(groupId: number) {
		return this.db
			.selectFrom('categories as c')
			.innerJoin('forums as f', 'f.cat_id', 'c.id')
			.leftJoin('forum_perms as fp', (join) => join.onRef('fp.forum_id', '=', 'f.id').on('fp.group_id', '=', groupId))
			.where((eb) => eb.or([eb('fp.read_forum', 'is', null), eb('fp.read_forum', '=', 1)]))
			.orderBy('c.disp_position')
			.orderBy('c.id')
			.orderBy('f.disp_position');
	}

	async listReadable(groupId: number): Promise<ForumCategory[]> {
		const rows = await this.#readableForums(groupId)
			.select(['c.id as cid', 'c.cat_name', 'f.id as fid', 'f.forum_name', 'f.redirect_url'])
			.execute();

		return groupByCategory(rows, (row) => ({ id: row.fid, name: row.forum_name, isRedirect: (row.redirect_url ?? '') !== '' }));
	}

	async listIndex(groupId: number): Promise<IndexCategory[]> {
		const rows = await this.#readableForums(groupId)
			.select([
				'c.id as cid',
				'c.cat_name',
				'f.id as fid',
				'f.forum_name',
				'f.forum_desc',
				'f.redirect_url',
				'f.moderators',
				'f.num_topics',
				'f.num_posts',
				'f.last_post',
				'f.last_post_id',
				'f.last_poster',
			])
			.execute();

		return groupByCategory(rows, (row) => ({
			id: row.fid,
			name: row.forum_name,
			descriptionHtml: row.forum_desc ?? '',
			redirectUrl: (row.redirect_url ?? '') !== '' ? (row.redirect_url ?? '') : null,
			moderators: parseModerators(row.moderators),
			numTopics: row.num_topics,
			numPosts: row.num_posts,
			lastPost:
				row.last_post !== null && row.last_post !== 0
					? { postedAt: row.last_post, postId: row.last_post_id ?? 0, poster: row.last_poster ?? '' }
					: null,
		}));
	}
}
