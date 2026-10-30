/**
 * Réduction des images dans le navigateur avant l'envoi (public/assets/js/image-resize.js) : ce
 * qu'il faut produire pour chaque formulaire, rendu en attributs data-* sur le champ fichier. Le
 * Worker n'a pas de bibliothèque d'images : le serveur vérifie ensuite type, dimensions et poids
 * comme pour un fichier envoyé sans JavaScript. Fonctions pures.
 */

import { THUMBNAIL_MAX_SIDE } from './gallery.ts';
import { HEADER_IMAGES, type HeaderImageKind } from './headerImages.ts';
import { FULL_MAX_SIDE, MOBILE_MAX_SIDE } from './imageVariants.ts';

export interface ResizeSpec {
	/** contain : tenir dans le cadre, sans agrandir ; cover : remplir le cadre, recadré au centre. */
	mode: 'contain' | 'cover';
	width: number;
	height: number;
	/** Variantes réduites, envoyées dans d'autres champs fichier du formulaire. */
	variants: { field: string; side: number }[];
}

/** Champs des variantes de la galerie (lus par GalleryController). */
export const GALLERY_MOBILE_FIELD = 'req_file_mobile';
export const GALLERY_THUMB_FIELD = 'req_file_thumb';

/** Galerie : image de 1 024 px, variante mobile de 640 px et vignette de 150 px. */
export function galleryResize(): ResizeSpec {
	return {
		mode: 'contain',
		width: FULL_MAX_SIDE,
		height: FULL_MAX_SIDE,
		variants: [
			{ field: GALLERY_MOBILE_FIELD, side: MOBILE_MAX_SIDE },
			{ field: GALLERY_THUMB_FIELD, side: THUMBNAIL_MAX_SIDE },
		],
	};
}

/** Avatar : recadré aux dimensions permises (o_avatars_width × o_avatars_height). */
export function avatarResize(width: number, height: number): ResizeSpec {
	return { mode: 'cover', width, height, variants: [] };
}

/** Logo, bannière : réduits dans leur cadre. */
export function headerImageResize(kind: HeaderImageKind): ResizeSpec {
	const spec = HEADER_IMAGES[kind];
	return { mode: 'contain', width: spec.maxWidth, height: spec.maxHeight, variants: [] };
}

/** Valeurs des attributs data-resize-* du champ fichier (partials/forms.njk, resizeAttributes). */
export interface ResizeView {
	mode: 'contain' | 'cover';
	width: number;
	height: number;
	/** « champ:côté champ:côté », vide sans variante. */
	variants: string;
}

export function resizeView(spec: ResizeSpec): ResizeView {
	return {
		mode: spec.mode,
		width: spec.width,
		height: spec.height,
		variants: spec.variants.map((variant) => `${variant.field}:${variant.side}`).join(' '),
	};
}
