/**
 * En-têtes de sécurité de toutes les réponses (AvroBB ; FluxBB n'en envoyait pas).
 *
 * Politique de contenu (CSP) :
 * - scripts : uniquement les fichiers du forum (aucun script en ligne dans les vues). Un script
 *   saisi par l'administrateur dans l'annonce ou les liens du menu ne s'exécute donc plus ;
 * - styles : fichiers du forum, et attributs style (couleurs des balises, bannière…) ;
 * - images : de partout en http(s), car les messages affichent des images d'autres sites ;
 * - cadres : vidéos YouTube (youtube-nocookie) et Dailymotion seulement ;
 * - formulaires : vers le forum, ou vers l'installation PHP tant qu'elle cohabite ;
 * - aucune intégration du forum dans un cadre d'un autre site (frame-ancestors, X-Frame-Options).
 *
 * HSTS seulement en HTTPS (derrière un proxy, TRUST_PROXY doit être activé pour le savoir).
 */

const VIDEO_FRAMES = ['https://www.youtube-nocookie.com', 'https://www.dailymotion.com'];

/** Origine (schéma, hôte, port) d'une URL, ou null si elle n'en a pas. */
function originOf(url: string): string | null {
	try {
		return new URL(url).origin;
	} catch {
		return null;
	}
}

export function contentSecurityPolicy(legacyBaseUrl: string): string {
	const legacy = originOf(legacyBaseUrl);
	const directives: Record<string, string[]> = {
		'default-src': ["'self'"],
		'script-src': ["'self'"],
		'style-src': ["'self'", "'unsafe-inline'"],
		'img-src': ["'self'", 'data:', 'https:', 'http:'],
		'font-src': ["'self'"],
		'connect-src': ["'self'"],
		'frame-src': ["'self'", ...VIDEO_FRAMES],
		'form-action': ["'self'", ...(legacy !== null ? [legacy] : [])],
		'frame-ancestors': ["'self'"],
		'base-uri': ["'self'"],
		'object-src': ["'none'"],
	};
	return Object.entries(directives)
		.map(([name, sources]) => `${name} ${sources.join(' ')}`)
		.join('; ');
}

export function securityHeaders(legacyBaseUrl: string, https: boolean): Record<string, string> {
	return {
		'Content-Security-Policy': contentSecurityPolicy(legacyBaseUrl),
		'X-Content-Type-Options': 'nosniff',
		'X-Frame-Options': 'SAMEORIGIN',
		'Referrer-Policy': 'strict-origin-when-cross-origin',
		'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
		...(https ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
	};
}
