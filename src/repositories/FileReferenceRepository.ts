/**
 * Références en base aux fichiers de R2, pour le nettoyage des fichiers orphelins (tâche planifiée) :
 * noms des images de la galerie, membres encore inscrits.
 */

import { chunks, ITEMS_PER_QUERY } from '../db/d1Dialect.ts';
import type { Db } from '../db/database.ts';

export interface FileReferenceReader {
	/** Noms des images de la galerie (« <date_ajout><ext> »). */
	galleryFileNames(): Promise<Set<string>>;
	/** Parmi `ids`, les membres qui existent encore. */
	existingUserIds(ids: readonly number[]): Promise<Set<number>>;
}

export class FileReferenceRepository implements FileReferenceReader {
	constructor(private readonly db: Db) {}

	async galleryFileNames(): Promise<Set<string>> {
		const rows = await this.db.selectFrom('gallery').select(['date_ajout', 'ext']).execute();
		return new Set(rows.map((row) => `${row.date_ajout}${row.ext}`));
	}

	async existingUserIds(ids: readonly number[]): Promise<Set<number>> {
		const existing = new Set<number>();
		// D1 limite le nombre de paramètres d'une requête (100) : par paquets.
		for (const part of chunks(ids, ITEMS_PER_QUERY)) {
			const rows = await this.db.selectFrom('users').select('id').where('id', 'in', part).execute();
			for (const row of rows) existing.add(row.id);
		}
		return existing;
	}
}
