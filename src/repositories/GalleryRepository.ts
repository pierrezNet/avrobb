/**
 * Galerie d'images de PV (table gallery, propre à Pilote-Virtuel), en lecture.
 */

import type { Db } from '../db/database.ts';
import type { GalleryImage } from '../domain/models.ts';

export interface GalleryReader {
	countImages(): Promise<number>;
	/** Images les plus récentes d'abord, avec le pseudo de l'auteur. */
	listImages(offset: number, limit: number): Promise<GalleryImage[]>;
}

export class GalleryRepository implements GalleryReader {
	constructor(private readonly db: Db) {}

	async countImages(): Promise<number> {
		const row = await this.db
			.selectFrom('gallery')
			.select((eb) => eb.fn.countAll<number>().as('total'))
			.executeTakeFirstOrThrow();
		return Number(row.total);
	}

	async listImages(offset: number, limit: number): Promise<GalleryImage[]> {
		const rows = await this.db
			.selectFrom('gallery as g')
			.innerJoin('users as u', 'u.id', 'g.user_id')
			.select(['g.id', 'g.titre', 'g.description', 'g.date_ajout', 'g.ext', 'u.username'])
			.orderBy('g.date_ajout', 'desc')
			.limit(limit)
			.offset(offset)
			.execute();

		// L'extension sert à construire une URL : seules les deux valeurs écrites par gallery.php passent.
		return rows.flatMap((row) =>
			row.ext === '.jpg' || row.ext === '.gif'
				? [
						{
							id: row.id,
							title: row.titre,
							username: row.username,
							description: row.description ?? '',
							addedAt: row.date_ajout,
							extension: row.ext,
						},
					]
				: [],
		);
	}
}
