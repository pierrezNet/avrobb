/**
 * Images envoyées par les membres (fichiers Uploadile, galerie) : converties en WebP, plus grand côté
 * limité à 1024 px, avec une variante mobile (640 px, préfixe « mobile_ ») servie aux petits écrans.
 * Règles de nommage et adresse de la variante mobile, en fonctions pures.
 */

/** Plus grand côté de l'image enregistrée. */
export const FULL_MAX_SIDE = 1024;
/** Plus grand côté de la variante mobile. */
export const MOBILE_MAX_SIDE = 640;
/** Largeur d'écran (px CSS) jusqu'à laquelle la variante mobile est servie. */
export const MOBILE_BREAKPOINT = 640;
/** Préfixe de la variante mobile (comme mini_ pour les vignettes : fichiers masqués des listes). */
export const MOBILE_PREFIX = 'mobile_';

/** Nom WebP d'une image envoyée : extension remplacée par .webp. */
export function webpName(fileName: string): string {
	const dot = fileName.lastIndexOf('.');
	return `${dot > 0 ? fileName.slice(0, dot) : fileName}.webp`;
}

/**
 * Adresse de la variante mobile d'une image du forum (img/members/<id>/ ou img/gallery/, au format
 * WebP, sous l'adresse du forum), ou null pour toute autre image : seules nos conversions en ont une.
 */
export function mobileVariantUrl(url: string, baseUrl: string): string | null {
	if (baseUrl === '' || !url.startsWith(`${baseUrl}/`)) return null;
	const path = url.slice(baseUrl.length);
	const match = /^\/img\/(members\/\d{1,10}|gallery)\/([^/?#]+\.webp)$/.exec(path);
	if (match === null) return null;
	const file = match[2] ?? '';
	if (file.startsWith(MOBILE_PREFIX) || file.startsWith('mini_')) return null;
	return `${baseUrl}/img/${match[1]}/${MOBILE_PREFIX}${file}`;
}
