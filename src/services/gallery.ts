/**
 * Règles de la galerie de PV (gallery.php) : envoi d'une image (titre, description, fichier et
 * vignette), droit de suppression, BBCode inséré dans un message. Fonctions pures.
 *
 * Écarts assumés : PNG et WebP acceptés en plus du GIF et du JPEG ; le type est lu dans le contenu.
 * Le Worker n'a pas de bibliothèque d'images : l'image est gardée telle qu'envoyée, dans les limites
 * de poids et de dimensions ci-dessous, et sert aussi de vignette (la réduction et la conversion
 * en WebP par le navigateur arrivent avec le lot 6 de TODO.md).
 */

import { type GalleryImage, GroupId, type Viewer } from '../domain/models.ts';
import { type ImageInfo, readImageInfo } from './images.ts';
import { punTrim } from './phpString.ts';

/** Taille maximale d'une image enregistrée ($max_size de gallery.php : 1,5 Mio). */
export const GALLERY_MAX_BYTES = 1_572_864;
/** Plus grand côté accepté : au-delà, l'image est à réduire avant l'envoi. */
export const GALLERY_MAX_SIDE = 4096;
/** Dimensions maximales d'une vignette ($largeur_max, $hauteur_max). */
export const THUMBNAIL_MAX_SIDE = 150;
export const GALLERY_TITLE_MAX = 40;
export const GALLERY_DESCRIPTION_MAX = 2000;

export type GalleryUploadError =
	| 'noTitle'
	| 'titleTooLong'
	| 'noDescription'
	| 'descriptionTooLong'
	| 'noFile'
	| 'badType'
	| 'tooLarge'
	| 'tooWide';

export interface ValidatedGalleryUpload {
	errors: GalleryUploadError[];
	title: string;
	description: string;
	/** Image reconnue à son contenu et dans les limites ; null en cas d'erreur sur le fichier. */
	image: ImageInfo | null;
}

export function validateGalleryUpload(input: { title: string; description: string; image: Buffer | null }): ValidatedGalleryUpload {
	const errors: GalleryUploadError[] = [];
	const title = punTrim(input.title);
	const description = punTrim(input.description).replaceAll('\r\n', '\n');
	if (title === '') errors.push('noTitle');
	else if ([...title].length > GALLERY_TITLE_MAX) errors.push('titleTooLong');
	if (description === '') errors.push('noDescription');
	else if ([...description].length > GALLERY_DESCRIPTION_MAX) errors.push('descriptionTooLong');

	const image = input.image !== null && input.image.length > 0 ? readImageInfo(input.image) : null;
	if (input.image === null || input.image.length === 0) errors.push('noFile');
	else if (image === null) errors.push('badType');
	else if (input.image.length > GALLERY_MAX_BYTES) errors.push('tooLarge');
	else if (image.width === 0 || image.height === 0 || Math.max(image.width, image.height) > GALLERY_MAX_SIDE) errors.push('tooWide');

	const fileOk = image !== null && !errors.some((error) => error === 'tooLarge' || error === 'tooWide');
	return { errors, title, description, image: fileOk ? image : null };
}

/** Supprimer une image : son auteur, un administrateur ou le groupe des modérateurs. */
export function canDeleteGalleryImage(viewer: Viewer, image: Pick<GalleryImage, 'userId'>): boolean {
	if (viewer.isGuest) return false;
	return image.userId === viewer.id || viewer.group.id === GroupId.Admin || viewer.group.id === GroupId.Moderator;
}

/** Chemins des fichiers d'une image, relatifs à la racine du forum. */
export function galleryFiles(image: Pick<GalleryImage, 'addedAt' | 'extension'>): { full: string; thumb: string } {
	return { full: `img/gallery/${image.addedAt}${image.extension}`, thumb: `img/gallery/mini_${image.addedAt}${image.extension}` };
}

/**
 * BBCode inséré dans un message : titre, image en grand et sa description (que l'insertion par
 * URL perdait). Adresse relative (/img/gallery/…) : une adresse absolue casserait au changement
 * de domaine (développement → production).
 */
export function galleryInsertCode(image: Pick<GalleryImage, 'title' | 'description' | 'addedAt' | 'extension'>): string {
	const url = `/${galleryFiles(image).full}`;
	return `[b]${image.title}[/b]\n[img]${url}[/img]\n${image.description}`;
}
