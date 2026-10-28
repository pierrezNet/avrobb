/**
 * Fichiers de la galerie de PV : img/gallery/<horodatage><ext>, sa vignette mini_<…> et, pour les
 * images converties en WebP, sa variante mobile mobile_<…>, dans l'installation PHP, qui les sert.
 */

import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GalleryExtension } from '../domain/models.ts';
import { MOBILE_PREFIX } from '../services/imageVariants.ts';

/** Dossier des images, relatif à la racine du PHP ($rep_upload de gallery.php). */
export const GALLERY_DIR = 'img/gallery';

export interface GalleryFileStore {
	/**
	 * Enregistre l'image, sa vignette et sa variante mobile. Renvoie l'horodatage retenu : `addedAt`,
	 * ou la seconde libre suivante si un fichier porte déjà ce nom.
	 */
	save(addedAt: number, extension: GalleryExtension, files: { image: Buffer; thumbnail: Buffer; mobile: Buffer }): Promise<number>;
	delete(addedAt: number, extension: GalleryExtension): Promise<void>;
}

export class GalleryFiles implements GalleryFileStore {
	constructor(private readonly legacyRoot: string) {}

	async save(addedAt: number, extension: GalleryExtension, files: { image: Buffer; thumbnail: Buffer; mobile: Buffer }): Promise<number> {
		const dir = path.join(this.legacyRoot, GALLERY_DIR);
		await mkdir(dir, { recursive: true });
		let stamp = Math.trunc(addedAt);
		while ((await stat(path.join(dir, `${stamp}${extension}`)).catch(() => null)) !== null) stamp += 1;

		const name = `${stamp}${extension}`;
		await writeFile(path.join(dir, name), files.image, { flag: 'wx' });
		await writeFile(path.join(dir, `mini_${name}`), files.thumbnail);
		await writeFile(path.join(dir, `${MOBILE_PREFIX}${name}`), files.mobile);
		return stamp;
	}

	async delete(addedAt: number, extension: GalleryExtension): Promise<void> {
		const dir = path.join(this.legacyRoot, GALLERY_DIR);
		const name = `${Math.trunc(addedAt)}${extension}`;
		await Promise.all([name, `mini_${name}`, `${MOBILE_PREFIX}${name}`].map((file) => rm(path.join(dir, file), { force: true })));
	}
}
