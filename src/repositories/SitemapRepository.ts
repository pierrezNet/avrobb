/**
 * Plan du site (sitemap.xml) : forums et discussions lisibles par un invité, avec la date de leur
 * dernier message. Permissions de forum (forum_perms) appliquées comme pour index.php.
 */

import type { Db } from '../db/database.ts';
import { GroupId } from '../domain/models.ts';
import { forumReadable } from './forumPermissions.ts';

export interface SitemapEntry {
	id: number;
	/** Nom du forum ou sujet de la discussion (slug de l'adresse). */
	title: string;
	lastPost: number;
}

export interface SitemapReader {
	listForums(): Promise<SitemapEntry[]>;
	/** Discussions les plus récemment actives d'abord (hors liens de redirection). */
	listTopics(limit: number): Promise<SitemapEntry[]>;
}

export class SitemapRepository implements SitemapReader {
	constructor(private readonly db: Db) {}

	#readableForums() {
		return this.db
			.selectFrom('forums as f')
			.leftJoin('forum_perms as fp', (join) => join.onRef('fp.forum_id', '=', 'f.id').on('fp.group_id', '=', GroupId.Guest))
			.where(forumReadable);
	}

	async listForums(): Promise<SitemapEntry[]> {
		const rows = await this.#readableForums()
			.where('f.redirect_url', 'is', null)
			.select(['f.id', 'f.forum_name', 'f.last_post'])
			.orderBy('f.id')
			.execute();
		return rows.map((row) => ({ id: row.id, title: row.forum_name, lastPost: row.last_post ?? 0 }));
	}

	async listTopics(limit: number): Promise<SitemapEntry[]> {
		const rows = await this.#readableForums()
			.innerJoin('topics as t', 't.forum_id', 'f.id')
			.where('t.moved_to', 'is', null)
			.select(['t.id', 't.subject', 't.last_post'])
			.orderBy('t.last_post', 'desc')
			.limit(limit)
			.execute();
		return rows.map((row) => ({ id: row.id, title: row.subject, lastPost: row.last_post }));
	}
}
