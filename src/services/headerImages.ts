/**
 * Logo et bannière du forum (AvroBB), réglables dans l'administration. Ils remplacent les fichiers
 * mêmes du PHP (img/logo.png, style/imports/img/banner.jpg) pour que les deux forums affichent les
 * mêmes images ; l'image précédente est gardée à côté pour pouvoir la rétablir.
 */

export type HeaderImageKind = 'logo' | 'banner';

export interface HeaderImageSpec {
	/** Fichier, relatif à la racine du PHP. */
	path: string;
	/** Copie de l'image précédente (bouton « Rétablir »). */
	previousPath: string;
	format: 'png' | 'jpeg';
	/** Cadre de réduction : deux fois la taille affichée, pour les écrans haute densité. */
	maxWidth: number;
	maxHeight: number;
}

export const HEADER_IMAGES: Readonly<Record<HeaderImageKind, HeaderImageSpec>> = {
	// Affiché sur 301 × 77 px au plus ; PNG pour garder la transparence.
	logo: { path: 'img/logo.png', previousPath: 'img/logo.previous.png', format: 'png', maxWidth: 1200, maxHeight: 308 },
	// Bandeau de 124 px de haut sur toute la largeur de la page (style/imports/styles.css du PHP).
	banner: {
		path: 'style/imports/img/banner.jpg',
		previousPath: 'style/imports/img/banner.previous.jpg',
		format: 'jpeg',
		maxWidth: 2560,
		maxHeight: 800,
	},
};

export function isHeaderImageKind(value: string): value is HeaderImageKind {
	return value === 'logo' || value === 'banner';
}

/**
 * Adresse d'une image avec sa version (o_header_version) : le nom du fichier ne change pas, la
 * version force les navigateurs à recharger l'image remplacée.
 */
export function headerImageHref(kind: HeaderImageKind, version: number): string {
	const { path } = HEADER_IMAGES[kind];
	return version > 0 ? `${path}?v=${version}` : path;
}
