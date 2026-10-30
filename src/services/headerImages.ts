/**
 * Logo et bannière du forum, réglables dans l'administration (page Apparence). Ils sont rangés dans
 * le stockage local, sous img/ (servi sous /img/) ; l'image précédente est gardée à côté pour
 * pouvoir la rétablir. Les images d'AvroBB (public/img/avrobb-*) sont installées au démarrage
 * quand le stockage n'en a pas encore.
 */

export type HeaderImageKind = 'logo' | 'banner';

export interface HeaderImageSpec {
	/** Fichier, relatif au stockage. */
	path: string;
	/** Image d'AvroBB installée quand le stockage n'en a pas, relative à public/. */
	defaultPath: string;
	/** Copie de l'image précédente (bouton « Rétablir »). */
	previousPath: string;
	format: 'png' | 'jpeg';
	/** Cadre de réduction : deux fois la taille affichée, pour les écrans haute densité. */
	maxWidth: number;
	maxHeight: number;
}

export const HEADER_IMAGES: Readonly<Record<HeaderImageKind, HeaderImageSpec>> = {
	// Affiché sur 301 × 77 px au plus ; PNG pour garder la transparence.
	logo: {
		path: 'img/logo.png',
		previousPath: 'img/logo.previous.png',
		defaultPath: 'img/avrobb-logo.png',
		format: 'png',
		maxWidth: 1204,
		maxHeight: 308,
	},
	// Bandeau de 124 px de haut sur toute la largeur de la page.
	banner: {
		path: 'img/banner.jpg',
		previousPath: 'img/banner.previous.jpg',
		defaultPath: 'img/avrobb-banner.jpg',
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
	// Chemin absolu : la bannière passe par une variable CSS, résolue depuis la feuille de style.
	const href = `/${HEADER_IMAGES[kind].path}`;
	return version > 0 ? `${href}?v=${version}` : href;
}
