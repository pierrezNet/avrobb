/**
 * Adresse de retour après connexion ou envoi d'un formulaire. Le PHP reprenait redirect_url du
 * formulaire sans contrôle (redirection ouverte) : seules les pages de ce site sont acceptées ici,
 * jamais la connexion elle-même.
 */

import { publicPath } from './routes.ts';

/** Chemin d'une page du forum : lettres, chiffres, tirets, points et barres, sans « .. » ni « // ». */
const SAFE_PATH = /^\/(?:[\w-]+(?:\.php)?(?:\/[\w-]+)*)?$/;
/** Pages où l'on ne revient pas : la connexion et son aller-retour chez le fournisseur. */
const EXCLUDED = /^\/(?:connexion|login\.php|register\.php|auth)(?:\/|$)/;

/**
 * Adresse publique sûre (« /message/12#p12 ») tirée d'une adresse absolue ou relative, si elle
 * désigne une page de ce site ; sinon l'accueil (« / »).
 */
export function safeRedirect(target: string, host: string | undefined): string {
	try {
		const url = new URL(target, `http://${host ?? 'localhost'}/`);
		if (host !== undefined && url.host !== host) return '/';
		if (!SAFE_PATH.test(url.pathname) || EXCLUDED.test(url.pathname)) return '/';
		// Ancienne adresse (« viewtopic.php?pid=12 ») : traduite en adresse publique, ancre comprise.
		return url.pathname.endsWith('.php')
			? publicPath(`${url.pathname.slice(1)}${url.search}${url.hash}`)
			: `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return '/';
	}
}
