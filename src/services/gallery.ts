/**
 * Règles de la galerie de PV (gallery.php) : envoi d'une image (titre, description, fichier et
 * vignette), droit de suppression, BBCode inséré dans un message. Fonctions pures.
 *
 * Écarts assumés : le PNG est accepté en plus du GIF et du JPEG ; le type est lu dans le contenu ;
 * la vignette est calculée par le navigateur (canvas, 150 px) et vérifiée ici, faute de
 * bibliothèque d'images côté serveur ; sans JavaScript, l'image sert de vignette.
 */

import { type GalleryExtension, type GalleryImage, GroupId, type Viewer } from '../domain/models.ts';
import { readImageInfo } from './images.ts';
import { punTrim } from './phpString.ts';

/** Taille maximale d'une image ($max_size de gallery.php : 1,5 Mio). */
export const GALLERY_MAX_BYTES = 1_572_864;
/** Dimensions maximales d'une vignette ($largeur_max, $hauteur_max). */
export const THUMBNAIL_MAX_SIDE = 150;
const THUMBNAIL_MAX_BYTES = 102_400;
export const GALLERY_TITLE_MAX = 40;
export const GALLERY_DESCRIPTION_MAX = 2000;

export type GalleryUploadError = 'noTitle' | 'titleTooLong' | 'noDescription' | 'descriptionTooLong' | 'noFile' | 'badType' | 'tooLarge';

const EXTENSIONS = { jpg: '.jpg', gif: '.gif', png: '.png' } as const satisfies Record<string, GalleryExtension>;

export interface ValidatedGalleryUpload {
	errors: GalleryUploadError[];
	title: string;
	description: string;
	extension: GalleryExtension | null;
	/** Vignette retenue : JPEG d'au plus 150 px de côté ; null pour reprendre l'image. */
	thumbnail: Buffer | null;
}

export function validateGalleryUpload(input: {
	title: string;
	description: string;
	image: Buffer | null;
	thumbnail: Buffer | null;
}): ValidatedGalleryUpload {
	const errors: GalleryUploadError[] = [];
	const title = punTrim(input.title);
	const description = punTrim(input.description).replaceAll('\r\n', '\n');
	if (title === '') errors.push('noTitle');
	else if ([...title].length > GALLERY_TITLE_MAX) errors.push('titleTooLong');
	if (description === '') errors.push('noDescription');
	else if ([...description].length > GALLERY_DESCRIPTION_MAX) errors.push('descriptionTooLong');

	let extension: GalleryExtension | null = null;
	if (input.image === null || input.image.length === 0) errors.push('noFile');
	else {
		const info = readImageInfo(input.image);
		if (info === null) errors.push('badType');
		else if (input.image.length > GALLERY_MAX_BYTES) errors.push('tooLarge');
		else extension = EXTENSIONS[info.type];
	}

	const thumbInfo = input.thumbnail !== null ? readImageInfo(input.thumbnail) : null;
	const thumbnail =
		input.thumbnail !== null &&
		thumbInfo?.type === 'jpg' &&
		thumbInfo.width <= THUMBNAIL_MAX_SIDE &&
		thumbInfo.height <= THUMBNAIL_MAX_SIDE &&
		input.thumbnail.length <= THUMBNAIL_MAX_BYTES
			? input.thumbnail
			: null;

	return { errors, title, description, extension, thumbnail };
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
 * URL perdait).
 */
export function galleryInsertCode(image: Pick<GalleryImage, 'title' | 'description' | 'addedAt' | 'extension'>, baseUrl: string): string {
	const url = `${baseUrl}/${galleryFiles(image).full}`;
	return `[b]${image.title}[/b]\n[img]${url}[/img]\n${image.description}`;
}
