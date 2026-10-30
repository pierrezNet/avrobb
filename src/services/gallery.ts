/**
 * Règles de la galerie de PV (gallery.php) : envoi d'une image (titre, description, fichier et
 * vignette), droit de suppression, BBCode inséré dans un message. Fonctions pures.
 *
 * Écarts assumés : PNG et WebP acceptés en plus du GIF et du JPEG ; le type est lu dans le contenu.
 * Le Worker n'a pas de bibliothèque d'images : le navigateur réduit l'image (1 024 px, WebP) et
 * envoie avec elle sa variante mobile et sa vignette (js/image-resize.js), vérifiées ici. Sans
 * JavaScript, l'image est gardée telle qu'envoyée, dans les limites ci-dessous, et sert de vignette.
 */

import { type GalleryImage, GroupId, type Viewer } from '../domain/models.ts';
import { type ImageInfo, type ImageType, readImageInfo } from './images.ts';
import { punTrim } from './phpString.ts';

/** Taille maximale d'une image enregistrée ($max_size de gallery.php : 1,5 Mio). */
export const GALLERY_MAX_BYTES = 1_572_864;
/** Plus grand côté accepté : au-delà, l'image est à réduire avant l'envoi. */
export const GALLERY_MAX_SIDE = 4096;
/** Images de la galerie par membre (les administrateurs n'ont pas de limite). */
export const GALLERY_MAX_IMAGES_PER_MEMBER = 200;
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
	| 'tooWide'
	| 'quota';

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

/**
 * Variante calculée par le navigateur (vignette, image mobile), gardée si c'est une image du même
 * format que l'image principale (elle est rangée sous la même extension), au plus `maxSide` de côté
 * et dans la limite de poids ; sinon null, et l'image principale la remplace.
 */
export function acceptedVariant(data: Buffer | undefined, mainType: ImageType, maxSide: number): Buffer | null {
	if (data === undefined || data.length === 0 || data.length > GALLERY_MAX_BYTES) return null;
	const info = readImageInfo(data);
	if (info === null || info.type !== mainType || info.width === 0 || info.height === 0) return null;
	return Math.max(info.width, info.height) <= maxSide ? data : null;
}

/** Quota d'images atteint (les administrateurs n'en ont pas). */
export function galleryQuotaReached(viewer: Viewer, imageCount: number): boolean {
	return viewer.group.id !== GroupId.Admin && imageCount >= GALLERY_MAX_IMAGES_PER_MEMBER;
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
