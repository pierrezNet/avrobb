/**
 * Règles des comptes (check_username(), is_banned_email() de FluxBB), sans accès à la base : pseudo
 * choisi ou modifié, adresse bannie, fuseaux horaires. La recherche d'un pseudo trop ressemblant
 * est faite par le contrôleur, qui transmet les résultats.
 */

import type { Ban } from './bans.ts';
import type { Censor } from './censor.ts';

/**
 * Fuseaux proposés par register.php, en heures (libellés dans lang/fr/account.ts). FluxBB
 * enregistre le décalage, sans gestion automatique de l'heure d'été.
 */
export const TIMEZONES = [
	-12, -11, -10, -9.5, -9, -8.5, -8, -7, -6, -5, -4, -3.5, -3, -2, -1, 0, 1, 2, 3, 3.5, 4, 4.5, 5, 5.5, 5.75, 6, 6.5, 7, 8, 8.75, 9, 9.5,
	10, 10.5, 11, 11.5, 12, 12.75, 13, 14,
] as const;

export type UsernameError = 'tooShort' | 'tooLong' | 'guest' | 'ip' | 'reservedChars' | 'bbcode' | 'censored' | 'banned';

/** Espaces multiples réduits à une seule (check_username()), pour éviter des pseudos indiscernables. */
export function normalizeUsername(username: string): string {
	return username.trim().replace(/\s+/g, ' ');
}

/** Variante sans ponctuation, comparée aux pseudos existants : « Max.DUO » ressemble à « MaxDUO ». */
export function usernameSkeleton(username: string): string {
	return username.replace(/[^\p{L}\p{N}]/gu, '');
}

const IPV4 = /[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/;
// Expression IPv6 de check_username(), recopiée telle quelle.
const IPV6 =
	/((([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}:[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){5}:([0-9A-Fa-f]{1,4}:)?[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){4}:([0-9A-Fa-f]{1,4}:){0,2}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){3}:([0-9A-Fa-f]{1,4}:){0,3}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){2}:([0-9A-Fa-f]{1,4}:){0,4}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}((\b((25[0-5])|(1\d{2})|(2[0-4]\d)|(\d{1,2}))\b)\.){3}(\b((25[0-5])|(1\d{2})|(2[0-4]\d)|(\d{1,2}))\b))|(([0-9A-Fa-f]{1,4}:){0,5}:((\b((25[0-5])|(1\d{2})|(2[0-4]\d)|(\d{1,2}))\b)\.){3}(\b((25[0-5])|(1\d{2})|(2[0-4]\d)|(\d{1,2}))\b))|(::([0-9A-Fa-f]{1,4}:){0,5}((\b((25[0-5])|(1\d{2})|(2[0-4]\d)|(\d{1,2}))\b)\.){3}(\b((25[0-5])|(1\d{2})|(2[0-4]\d)|(\d{1,2}))\b))|([0-9A-Fa-f]{1,4}::([0-9A-Fa-f]{1,4}:){0,5}[0-9A-Fa-f]{1,4})|(::([0-9A-Fa-f]{1,4}:){0,6}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){1,7}:))/;
const BBCODE =
	/(?:\[\/?(?:b|u|s|ins|del|em|i|h|colou?r|quote|code|img|url|email|list|\*|topic|post|forum|user)\]|\[(?:img|url|quote|list)=)/i;

/** check_username(), hors recherche des doublons. */
export function checkUsername(username: string, guestLabel: string, bans: readonly Ban[], censor: Censor | null): UsernameError[] {
	const length = [...username].length;
	const lower = username.toLowerCase();

	let error: UsernameError | null = null;
	if (length < 2) error = 'tooShort';
	else if (length > 25) error = 'tooLong';
	else if (lower === 'guest' || lower === guestLabel.toLowerCase()) error = 'guest';
	else if (IPV4.test(username) || IPV6.test(username)) error = 'ip';
	else if ((username.includes('[') || username.includes(']')) && username.includes("'") && username.includes('"')) error = 'reservedChars';
	else if (BBCODE.test(username)) error = 'bbcode';

	const errors: UsernameError[] = error !== null ? [error] : [];
	if (censor !== null && censor(username) !== username) errors.push('censored');
	if (bans.some((ban) => ban.username !== '' && ban.username.toLowerCase() === lower)) errors.push('banned');
	return errors;
}

/** is_banned_email() : adresse exacte, ou domaine entier quand le bannissement n'a pas d'arobase. */
export function isBannedEmail(email: string, bans: readonly Ban[]): boolean {
	return bans.some(
		(ban) =>
			ban.email !== '' &&
			(email === ban.email || (!ban.email.includes('@') && email.toLowerCase().includes(`@${ban.email.toLowerCase()}`))),
	);
}
