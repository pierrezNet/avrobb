/**
 * Forums et catégories : liste « Atteindre » du pied de page (generate_quickjump_cache()).
 */

import type { Db } from '../db/database.ts';
import type { ForumCategory } from '../domain/models.ts';

export interface ForumReader {
	/** Catégories et forums lisibles par le groupe, dans l'ordre d'affichage. */
	listReadable(groupId: number): Promise<ForumCategory[]>;
}

export class ForumRepository implements ForumReader {
	constructor(private readonly db: Db) {}

	async listReadable(groupId: number): Promise<ForumCategory[]> {
		const rows = await this.db
			.selectFrom('categories as c')
			.innerJoin('forums as f', 'f.cat_id', 'c.id')
			.leftJoin('forum_perms as fp', (join) => join.onRef('fp.forum_id', '=', 'f.id').on('fp.group_id', '=', groupId))
			.select(['c.id as cid', 'c.cat_name', 'f.id as fid', 'f.forum_name', 'f.redirect_url'])
			.where((eb) => eb.or([eb('fp.read_forum', 'is', null), eb('fp.read_forum', '=', 1)]))
			.orderBy('c.disp_position')
			.orderBy('c.id')
			.orderBy('f.disp_position')
			.execute();

		const categories: ForumCategory[] = [];

		for (const row of rows) {
			let category = categories.at(-1);
			if (category?.id !== row.cid) {
				category = { id: row.cid, name: row.cat_name, forums: [] };
				categories.push(category);
			}
			category.forums.push({ id: row.fid, name: row.forum_name, isRedirect: (row.redirect_url ?? '') !== '' });
		}

		return categories;
	}
}
