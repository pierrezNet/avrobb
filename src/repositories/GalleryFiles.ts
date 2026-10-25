/**
 * Fichiers de la galerie de PV : img/gallery/<horodatage><ext> et sa vignette mini_<…> dans
 * l'installation PHP, qui les sert.
 */

import { copyFile, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GalleryExtension } from '../domain/models.ts';

/** Dossier des images, relatif à la racine du PHP ($rep_upload de gallery.php). */
export const GALLERY_DIR = 'img/gallery';

export interface GalleryFileStore {
	/**
	 * Enregistre l'image et sa vignette (l'image elle-même à défaut). Renvoie l'horodatage
	 * retenu : `addedAt`, ou la seconde libre suivante si un fichier porte déjà ce nom.
	 */
	save(addedAt: number, extension: GalleryExtension, image: Buffer, thumbnail: Buffer | null): Promise<number>;
	delete(addedAt: number, extension: GalleryExtension): Promise<void>;
}

export class GalleryFiles implements GalleryFileStore {
	constructor(private readonly legacyRoot: string) {}

	async save(addedAt: number, extension: GalleryExtension, image: Buffer, thumbnail: Buffer | null): Promise<number> {
		const dir = path.join(this.legacyRoot, GALLERY_DIR);
		await mkdir(dir, { recursive: true });
		let stamp = Math.trunc(addedAt);
		while ((await stat(path.join(dir, `${stamp}${extension}`)).catch(() => null)) !== null) stamp += 1;

		const file = path.join(dir, `${stamp}${extension}`);
		const mini = path.join(dir, `mini_${stamp}${extension}`);
		await writeFile(file, image, { flag: 'wx' });
		if (thumbnail !== null) await writeFile(mini, thumbnail);
		else await copyFile(file, mini);
		return stamp;
	}

	async delete(addedAt: number, extension: GalleryExtension): Promise<void> {
		const dir = path.join(this.legacyRoot, GALLERY_DIR);
		const name = `${Math.trunc(addedAt)}${extension}`;
		await Promise.all([rm(path.join(dir, name), { force: true }), rm(path.join(dir, `mini_${name}`), { force: true })]);
	}
}
