/**
 * Galerie d'images de PV (table gallery, propre à Pilote-Virtuel) : liste, envoi, suppression.
 * Les fichiers eux-mêmes sont gérés par repositories/GalleryFiles.ts.
 */

import type { Db } from '../db/database.ts';
import type { GalleryExtension, GalleryImage } from '../domain/models.ts';

export interface GalleryReader {
	/** Nombre d'images, de tous ou d'un seul membre (filtre « Mes images »). */
	countImages(ownerId?: number | null): Promise<number>;
	/** Images les plus récentes d'abord, avec le pseudo de l'auteur. */
	listImages(offset: number, limit: number, ownerId?: number | null): Promise<GalleryImage[]>;
}

export interface NewGalleryImage {
	title: string;
	description: string;
	userId: number;
	/** Horodatage d'envoi, qui donne aussi le nom du fichier. */
	addedAt: number;
	extension: GalleryExtension;
}

export interface GalleryStore extends GalleryReader {
	findImage(id: number): Promise<GalleryImage | null>;
	createImage(image: NewGalleryImage): Promise<number>;
	deleteImage(id: number): Promise<void>;
}

/** L'extension sert à construire une URL : seules les valeurs connues passent. */
const isGalleryExtension = (ext: string): ext is GalleryExtension => ext === '.jpg' || ext === '.gif' || ext === '.png';

export class GalleryRepository implements GalleryStore {
	constructor(private readonly db: Db) {}

	#images(ownerId: number | null) {
		let query = this.db.selectFrom('gallery as g').innerJoin('users as u', 'u.id', 'g.user_id');
		if (ownerId !== null) query = query.where('g.user_id', '=', ownerId);
		return query;
	}

	async countImages(ownerId: number | null = null): Promise<number> {
		const row = await this.#images(ownerId)
			.select((eb) => eb.fn.countAll<number>().as('total'))
			.executeTakeFirstOrThrow();
		return Number(row.total);
	}

	async listImages(offset: number, limit: number, ownerId: number | null = null): Promise<GalleryImage[]> {
		const rows = await this.#images(ownerId)
			.select(['g.id', 'g.titre', 'g.user_id', 'g.description', 'g.date_ajout', 'g.ext', 'u.username'])
			.orderBy('g.date_ajout', 'desc')
			.orderBy('g.id', 'desc')
			.limit(limit)
			.offset(offset)
			.execute();
		return rows.flatMap((row) => toImage(row));
	}

	async findImage(id: number): Promise<GalleryImage | null> {
		const row = await this.#images(null)
			.select(['g.id', 'g.titre', 'g.user_id', 'g.description', 'g.date_ajout', 'g.ext', 'u.username'])
			.where('g.id', '=', id)
			.executeTakeFirst();
		return row !== undefined ? (toImage(row)[0] ?? null) : null;
	}

	async createImage(image: NewGalleryImage): Promise<number> {
		const result = await this.db
			.insertInto('gallery')
			.values({
				titre: image.title,
				user_id: image.userId,
				description: image.description,
				date_ajout: image.addedAt,
				ext: image.extension,
			})
			.executeTakeFirstOrThrow();
		return Number(result.insertId);
	}

	async deleteImage(id: number): Promise<void> {
		await this.db.deleteFrom('gallery').where('id', '=', id).execute();
	}
}

function toImage(row: {
	id: number;
	titre: string;
	user_id: number;
	description: string | null;
	date_ajout: number;
	ext: string;
	username: string;
}): GalleryImage[] {
	if (!isGalleryExtension(row.ext)) return [];
	return [
		{
			id: row.id,
			title: row.titre,
			userId: row.user_id,
			username: row.username,
			description: row.description ?? '',
			addedAt: row.date_ajout,
			extension: row.ext,
		},
	];
}
