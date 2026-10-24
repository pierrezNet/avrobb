/**
 * Jeton CSRF commun à tous les formulaires POST (le PHP de FluxBB ne se fiait qu'au Referer).
 *
 * Double soumission : un cookie aléatoire propre au navigateur (<cookie_name>_csrf), et dans chaque
 * formulaire un HMAC de ce cookie lié au visiteur. Un site tiers ne peut ni lire le cookie ni
 * calculer le jeton ; l'en-tête Origin, quand il est présent, doit en plus désigner ce site.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { LegacyCookieConfig } from '../config.ts';
import { type FormBody, field } from './forms.ts';

/** Nom du champ caché des formulaires. */
export const CSRF_FIELD = 'csrf_token';

export function csrfCookieName(cookie: LegacyCookieConfig): string {
	return `${cookie.name}_csrf`;
}

/** Jeton attendu dans les formulaires de ce navigateur pour ce visiteur. */
export function csrfToken(secret: string, seed: string, userId: number): string {
	return createHmac('sha256', `${seed}_csrf`).update(`${secret}|${userId}`).digest('hex');
}

/** Lit ou crée le secret du navigateur (cookie HttpOnly de session) et renvoie le jeton du visiteur. */
export function ensureCsrfToken(request: FastifyRequest, reply: FastifyReply, cookie: LegacyCookieConfig, userId: number): string {
	const name = csrfCookieName(cookie);
	let secret = request.cookies[name];

	if (secret === undefined || !/^[0-9a-f]{64}$/.test(secret)) {
		secret = randomBytes(32).toString('hex');
		reply.setCookie(name, secret, {
			path: cookie.path,
			httpOnly: true,
			secure: cookie.secure,
			sameSite: 'lax',
			...(cookie.domain !== '' ? { domain: cookie.domain } : {}),
		});
		// Disponible dès cette requête pour un POST qui arriverait sans cookie : il sera refusé.
		request.cookies[name] = secret;
	}

	return csrfToken(secret, cookie.seed, userId);
}

/** L'en-tête Origin, s'il existe, désigne-t-il l'hôte de la requête ? */
function sameOrigin(request: FastifyRequest): boolean {
	const origin = request.headers.origin;
	if (origin === undefined || origin === 'null') return origin === undefined;
	try {
		return new URL(origin).host === request.headers.host;
	} catch {
		return false;
	}
}

/** Vérifie le jeton d'un formulaire POST. */
export function isValidCsrf(request: FastifyRequest, cookie: LegacyCookieConfig, userId: number): boolean {
	const secret = request.cookies[csrfCookieName(cookie)];
	const sent = field(request.body as FormBody | undefined, CSRF_FIELD);
	if (secret === undefined || sent === '' || !sameOrigin(request)) return false;

	const expected = Buffer.from(csrfToken(secret, cookie.seed, userId));
	const actual = Buffer.from(sent);
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}
