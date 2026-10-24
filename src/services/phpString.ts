/**
 * Petites fonctions de chaîne de FluxBB (include/functions.php, include/utf8/) dont le comportement
 * exact compte pour la parité des textes enregistrés : jeu de caractères de trim(), fins de ligne,
 * détection des majuscules.
 */

/** Caractères retirés par trim() sans liste explicite. */
const PHP_TRIM_CHARS = ' \t\n\r\0\v';

const escapeClass = (chars: string): string => chars.replace(/[\\\]^-]/g, '\\$&');

/** pun_trim() : trim() de PHP, ou sur la liste de caractères donnée (utf8_trim()). */
export function punTrim(text: string, chars: string = PHP_TRIM_CHARS): string {
	const set = escapeClass(chars);
	return text.replace(new RegExp(`^[${set}]+`, 'u'), '').replace(new RegExp(`[${set}]+$`, 'u'), '');
}

/** pun_linebreaks() : fins de ligne CRLF et CR ramenées à LF. */
export function punLinebreaks(text: string): string {
	return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

/** is_all_uppercase() : le texte ne change pas en majuscules mais change en minuscules. */
export function isAllUppercase(text: string): boolean {
	return text.toUpperCase() === text && text.toLowerCase() !== text;
}

/** empty() de PHP sur une chaîne : vide ou « 0 ». */
export const phpEmpty = (text: string): boolean => text === '' || text === '0';
