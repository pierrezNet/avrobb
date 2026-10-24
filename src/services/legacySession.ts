/**
 * Lecture du cookie de session FluxBB 1.5, pour que l'application Node reconnaisse un membre
 * connecté sur l'installation PHP (cohabitation pendant la migration).
 *
 * Format posé par pun_setcookie() :
 *   user_id | hmac(password, seed_password_hash) | expiration | hmac(user_id|expiration, seed_cookie_hash)
 * avec hmac = HMAC-SHA1 en hexadécimal (forum_hmac()).
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface LegacyCookie {
	userId: number;
	passwordHash: string;
	expires: number;
	cookieHash: string;
}

export function forumHmac(data: string, key: string): string {
	return createHmac('sha1', key).update(data).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
	const left = Buffer.from(a.toLowerCase(), 'utf8');
	const right = Buffer.from(b.toLowerCase(), 'utf8');
	return left.length === right.length && timingSafeEqual(left, right);
}

export function parseLegacyCookie(value: string | undefined): LegacyCookie | null {
	if (value === undefined) return null;

	const match = /^(\d+)\|([0-9a-fA-F]+)\|(\d+)\|([0-9a-fA-F]+)$/.exec(value);
	if (match === null) return null;

	const [, userId = '', passwordHash = '', expires = '', cookieHash = ''] = match;
	return { userId: Number(userId), passwordHash, expires: Number(expires), cookieHash };
}

/** Le cookie est-il signé correctement et non expiré ? (sans consulter la base) */
export function isCookieSignatureValid(cookie: LegacyCookie, seed: string, now: number): boolean {
	if (cookie.expires <= now) return false;

	const expected = forumHmac(`${cookie.userId}|${cookie.expires}`, `${seed}_cookie_hash`);
	return safeEqualHex(expected, cookie.cookieHash);
}

/** Le cookie correspond-il au mot de passe actuel de l'utilisateur ? */
export function isCookiePasswordValid(cookie: LegacyCookie, userPasswordHash: string, seed: string): boolean {
	const expected = forumHmac(userPasswordHash, `${seed}_password_hash`);
	return safeEqualHex(expected, cookie.passwordHash);
}

/** sha1() de PHP, nommé pun_hash() dans FluxBB. */
export function punHash(text: string): string {
	return createHash('sha1').update(text).digest('hex');
}

/**
 * Jeton du lien « Déconnexion » de header.php, vérifié par login.php?action=out :
 * pun_hash(id . pun_hash(get_remote_address())). Il dépend de l'IP vue par le serveur : derrière un
 * proxy, Node et PHP doivent voir la même adresse (trustProxy / FORUM_BEHIND_REVERSE_PROXY).
 */
export function logoutToken(userId: number, remoteAddress: string): string {
	return punHash(`${userId}${punHash(remoteAddress)}`);
}
