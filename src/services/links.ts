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
