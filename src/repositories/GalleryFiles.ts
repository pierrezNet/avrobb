/**
 * Fichiers de la galerie dans R2 : img/gallery/<horodatage><ext>, sa vignette mini_<…> et, pour une
 * image WebP, sa variante mobile mobile_<…> (servis sous /img/). Le nom est fabriqué par le serveur
 * (horodatage, extension tirée du contenu), jamais repris du fichier envoyé.
 */

import type { GalleryExtension } from '../domain/models.ts';
import { IMAGE_CONTENT_TYPES, type ImageType } from '../services/images.ts';
import { MOBILE_PREFIX } from '../services/imageVariants.ts';
import type { FileStore } from './FileStore.ts';

/** Dossier des images ($rep_upload de gallery.php), préfixe des clés R2. */
export const GALLERY_DIR = 'img/gallery';

export interface GalleryFileStore {
	/**
	 * Enregistre l'image, sa vignette et, s'il y en a une, sa variante mobile. Renvoie l'horodatage
	 * retenu : `addedAt`, ou la seconde libre suivante si un fichier porte déjà ce nom.
	 */
	save(addedAt: number, type: ImageType, files: { image: Uint8Array; thumbnail: Uint8Array; mobile: Uint8Array | null }): Promise<number>;
	delete(addedAt: number, extension: GalleryExtension): Promise<void>;
}

export class GalleryFiles implements GalleryFileStore {
	constructor(private readonly files: FileStore) {}

	async save(
		addedAt: number,
		type: ImageType,
		files: { image: Uint8Array; thumbnail: Uint8Array; mobile: Uint8Array | null },
	): Promise<number> {
		const extension = `.${type}`;
		let stamp = Math.trunc(addedAt);
		// R2 n'a pas d'écriture exclusive : deux envois dans la même seconde par deux membres restent
		// possibles mais improbables sur un petit forum ; le suivant écraserait le précédent.
		while ((await this.files.head(`${GALLERY_DIR}/${stamp}${extension}`)) !== null) stamp += 1;

		const name = `${stamp}${extension}`;
		const contentType = IMAGE_CONTENT_TYPES[type];
		await this.files.put(`${GALLERY_DIR}/${name}`, files.image, contentType);
		await this.files.put(`${GALLERY_DIR}/mini_${name}`, files.thumbnail, contentType);
		if (files.mobile !== null) await this.files.put(`${GALLERY_DIR}/${MOBILE_PREFIX}${name}`, files.mobile, contentType);
		return stamp;
	}

	async delete(addedAt: number, extension: GalleryExtension): Promise<void> {
		const name = `${Math.trunc(addedAt)}${extension}`;
		await this.files.delete([name, `mini_${name}`, `${MOBILE_PREFIX}${name}`].map((file) => `${GALLERY_DIR}/${file}`));
	}
}
