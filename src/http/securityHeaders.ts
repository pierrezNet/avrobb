/**
 * En-têtes de sécurité de toutes les réponses (AvroBB ; FluxBB n'en envoyait pas).
 *
 * Politique de contenu (CSP) :
 * - scripts : uniquement les fichiers du forum (aucun script en ligne dans les vues). Un script
 *   saisi par l'administrateur dans l'annonce ou les liens du menu ne s'exécute donc plus ;
 * - styles : fichiers du forum, et attributs style (couleurs des balises, bannière…) ;
 * - images : de partout en http(s), car les messages affichent des images d'autres sites ;
 * - cadres : vidéos YouTube (youtube-nocookie) et Dailymotion seulement ;
 * - formulaires : vers le forum seulement ;
 * - aucune intégration du forum dans un cadre d'un autre site (frame-ancestors, X-Frame-Options).
 *
 * HSTS seulement en HTTPS (adresse de la requête reçue par le Worker).
 */

const VIDEO_FRAMES = ['https://www.youtube-nocookie.com', 'https://www.dailymotion.com'];

export function contentSecurityPolicy(): string {
	const directives: Record<string, string[]> = {
		'default-src': ["'self'"],
		'script-src': ["'self'"],
		'style-src': ["'self'", "'unsafe-inline'"],
		'img-src': ["'self'", 'data:', 'https:', 'http:'],
		'font-src': ["'self'"],
		'connect-src': ["'self'"],
		'frame-src': ["'self'", ...VIDEO_FRAMES],
		'form-action': ["'self'"],
		'frame-ancestors': ["'self'"],
		'base-uri': ["'self'"],
		'object-src': ["'none'"],
	};
	return Object.entries(directives)
		.map(([name, sources]) => `${name} ${sources.join(' ')}`)
		.join('; ');
}

export function securityHeaders(https: boolean): Record<string, string> {
	return {
		'Content-Security-Policy': contentSecurityPolicy(),
		'X-Content-Type-Options': 'nosniff',
		'X-Frame-Options': 'SAMEORIGIN',
		'Referrer-Policy': 'strict-origin-when-cross-origin',
		'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
		...(https ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
	};
}
