/**
 * Logo et bannière du forum, réglables dans l'administration (page Apparence). Ils sont rangés dans
 * R2, sous img/ (servi sous /img/) ; l'image précédente est gardée à côté pour pouvoir la rétablir.
 * Tant qu'aucune n'a été envoyée (o_header_version à 0), l'en-tête affiche les images d'AvroBB de
 * public/assets/img/.
 */

export type HeaderImageKind = 'logo' | 'banner';

export interface HeaderImageSpec {
	/** Clé R2. Le nom garde son extension quel que soit le format envoyé (type MIME fixé à l'écriture). */
	path: string;
	/** Image d'AvroBB, relative à public/assets/. */
	defaultPath: string;
	/** Copie de l'image précédente (bouton « Rétablir »). */
	previousPath: string;
	/** Dimensions maximales acceptées : deux fois la taille affichée, pour les écrans haute densité. */
	maxWidth: number;
	maxHeight: number;
}

export const HEADER_IMAGES: Readonly<Record<HeaderImageKind, HeaderImageSpec>> = {
	// Affiché sur 301 × 77 px au plus ; PNG ou WebP pour garder la transparence.
	logo: {
		path: 'img/logo.png',
		previousPath: 'img/logo.previous.png',
		defaultPath: 'img/avrobb-logo.png',
		maxWidth: 1204,
		maxHeight: 308,
	},
	// Bandeau de 124 px de haut sur toute la largeur de la page.
	banner: {
		path: 'img/banner.jpg',
		previousPath: 'img/banner.previous.jpg',
		defaultPath: 'img/avrobb-banner.jpg',
		maxWidth: 2560,
		maxHeight: 800,
	},
};

export function isHeaderImageKind(value: string): value is HeaderImageKind {
	return value === 'logo' || value === 'banner';
}

/**
 * Adresse d'une image avec sa version (o_header_version) : le nom du fichier ne change pas, la
 * version force les navigateurs à recharger l'image remplacée. Version 0 : image d'AvroBB.
 */
export function headerImageHref(kind: HeaderImageKind, version: number): string {
	// Chemins absolus : la bannière passe par une variable CSS, résolue depuis la feuille de style.
	// Image d'AvroBB sans empreinte : elle ne change pas, et ne sert que jusqu'au premier envoi.
	if (version <= 0) return `/assets/${HEADER_IMAGES[kind].defaultPath}`;
	return `/${HEADER_IMAGES[kind].path}?v=${version}`;
}
