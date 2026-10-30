/**
 * Cookie de session d'AvroBB : `<id du membre>.<numéro de session>.<échéance>.<signature>`, signé
 * par HMAC-SHA256 avec le secret de l'application. Rien n'est stocké côté serveur : un cookie valide
 * identifie le membre, relu en base à chaque requête (groupe, bannissement). Le numéro de session
 * (users.session_version) doit être celui du compte : l'incrémenter déconnecte le membre de partout.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SessionCookie {
	userId: number;
	/** users.session_version au moment de la connexion. */
	version: number;
	expires: number;
}

/** Durée d'une session (30 jours), prolongée au fil des visites. */
export const SESSION_SECONDS = 30 * 86_400;

/** On ne renouvelle le cookie qu'une fois par jour, pour ne pas en poser un à chaque page. */
const RENEW_AFTER_SECONDS = 86_400;

function sign(payload: string, secret: string): string {
	return createHmac('sha256', `${secret}|session`).update(payload).digest('hex');
}

export function buildSessionCookie(session: SessionCookie, secret: string): string {
	const payload = `${session.userId}.${session.version}.${session.expires}`;
	return `${payload}.${sign(payload, secret)}`;
}

/** Cookie lu, signature vérifiée, non expiré ; null sinon. */
export function readSessionCookie(value: string | undefined, secret: string, now: number): SessionCookie | null {
	const match = /^(\d{1,10})\.(\d{1,10})\.(\d{1,12})\.([0-9a-f]{64})$/.exec(value ?? '');
	if (match === null) return null;

	const [, userId = '', version = '', expires = '', signature = ''] = match;
	const expected = Buffer.from(sign(`${userId}.${version}.${expires}`, secret));
	const actual = Buffer.from(signature);
	if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

	const cookie = { userId: Number(userId), version: Number(version), expires: Number(expires) };
	return cookie.userId > 0 && cookie.expires > now ? cookie : null;
}

/** Faut-il reposer le cookie avec une nouvelle échéance ? */
export function shouldRenewSession(expires: number, now: number): boolean {
	return expires - now < SESSION_SECONDS - RENEW_AFTER_SECONDS;
}

/**
 * Durée de vie d'un cookie posé jusqu'à `expires` : null (cookie de session du navigateur) si
 * l'échéance ne dépasse pas la durée d'une visite, sinon le nombre de secondes restantes.
 */
export function cookieMaxAge(expires: number, now: number, timeoutVisit: number): number | null {
	return expires - now - timeoutVisit < 1 ? null : expires - now;
}

/**
 * La connexion de développement est-elle permise pour cette requête ? Activée par DEV_LOGIN et
 * seulement depuis la machine elle-même : elle permet de se connecter sans fournisseur SSO.
 */
export function isDevLoginAllowed(enabled: boolean, remoteAddress: string): boolean {
	return enabled && (remoteAddress === '127.0.0.1' || remoteAddress === '::1' || remoteAddress === '::ffff:127.0.0.1');
}
