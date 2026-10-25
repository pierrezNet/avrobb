/**
 * Liens saisis par les membres hors BBCode (site web du profil…).
 */

/**
 * URL utilisable en href : celles qui n'ont pas de schéma http(s)/ftp sont préfixées de http://,
 * comme handle_url_tag(). Le PHP de viewtopic affichait users.url telle quelle : « javascript:… »
 * y restait exécutable.
 */
export function safeExternalUrl(url: string): string {
	const trimmed = url.trim();
	return /^(https?|ftps?):\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

const URI = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/(?:([^@/?#]*)@)?(\[[0-9A-Fa-f:.vV]+\]|[^:/?#]+)(?::([0-9]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/;
/** Caractères permis par la RFC 3986 dans le chemin, la requête et le fragment (url_valid()). */
const URI_CHARS = /^(?:[A-Za-z0-9\-._~!$&'()*+,;=:@/?\\]|%[0-9A-Fa-f]{2})*$/;
const IPV4 = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
/** Nom de domaine en parties séparées par des points, avec un domaine de premier niveau alphabétique. */
const DNS_HOST = /^(?!.{256})(?:[0-9A-Za-z]\.|[0-9A-Za-z][-0-9A-Za-z]{0,61}[0-9A-Za-z]\.)*(?:[A-Za-z]{3,6}|[A-Za-z]{2})$/;

/**
 * url_valid() de PV, pour le site web du profil : « www. » et « ftp. » reçoivent leur schéma, puis
 * l'adresse doit être une URI absolue http(s) ou ftp(s) avec un hôte valide. Renvoie l'adresse
 * complétée, ou null si elle est refusée.
 */
export function validWebsiteUrl(input: string): string | null {
	let url = input;
	if (url.startsWith('www.')) url = `https://${url}`;
	else if (url.startsWith('ftp.')) url = `ftp://${url}`;

	const match = URI.exec(url);
	if (match === null) return null;
	const [, scheme = '', userinfo, host = '', , path = '', query = '', fragment = ''] = match;

	switch (scheme) {
		case 'http':
		case 'https':
			// Le schéma HTTP n'admet pas d'identifiants dans l'adresse.
			if (userinfo !== undefined && userinfo !== '') return null;
			break;
		case 'ftp':
		case 'ftps':
			break;
		default:
			return null;
	}
	if (![path, query, fragment, userinfo ?? ''].every((part) => URI_CHARS.test(part))) return null;
	if (!host.startsWith('[') && !IPV4.test(host) && !DNS_HOST.test(host)) return null;
	return url;
}
