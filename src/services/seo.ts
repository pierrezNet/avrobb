/**
 * Référencement (AvroBB) : texte de la balise description, première image d'un message (aperçu de
 * partage), robots.txt. Fonctions pures.
 */

import { localizePath } from './routes.ts';

const FIRST_IMG = /\[img(?:=[^\]]*)?\]\s*(https?:\/\/[^\s[\]"<>]+?)\s*\[\/img\]/i;

/** Longueur conseillée d'une description de page (extrait affiché par les moteurs). */
export const DESCRIPTION_MAX = 160;

/**
 * Texte brut d'un message BBCode ou d'un HTML d'administration : balises retirées, espaces
 * resserrés, coupé à `max` caractères sur une fin de mot (« … »). null si rien ne reste.
 */
export function plainExcerpt(source: string, max = DESCRIPTION_MAX): string | null {
	const text = source
		.replace(/\[(?:img|video)(?:=[^\]]*)?\][\s\S]*?\[\/(?:img|video)\]/gi, ' ')
		.replace(/\[quote(?:=[^\]]*)?\][\s\S]*?\[\/quote\]/gi, ' ')
		.replace(/\[\/?[a-z*]+(?:=[^\]]*)?\]/gi, '')
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (text === '') return null;
	const chars = [...text];
	if (chars.length <= max) return text;
	const cut = chars.slice(0, max - 1).join('');
	const space = cut.lastIndexOf(' ');
	return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.!?]+$/, '')}…`;
}

/** Première image ([img]) d'une suite de messages, pour l'aperçu de partage d'une discussion. */
export function firstImageUrl(messages: readonly string[]): string | null {
	for (const message of messages) {
		const url = FIRST_IMG.exec(message)?.[1];
		if (url !== undefined) return url;
	}
	return null;
}

/** Pages sans intérêt pour un moteur de recherche (formulaires, comptes, administration). */
const DISALLOWED = [
	'/admin_',
	'/post.php',
	'/edit.php',
	'/delete.php',
	'/moderate.php',
	'/misc.php',
	'/recherche',
	'/connexion',
	'/auth/',
	'/profile.php',
	'/pms_',
	'/draft_',
	'/member_suggest.php',
	'/topic_prefixes.php',
	'/reputation.php',
	'/extern.php',
	// Anciennes adresses des pages publiques, toujours servies : seules les adresses propres comptent.
	'/index.php',
	'/viewforum.php',
	'/viewtopic.php',
	'/userlist.php',
	'/search.php',
	'/gallery.php',
	'/login.php',
];

export function robotsTxt(baseUrl: string): string {
	// Mêmes pages exclues sous /en/ (« /en/post.php »).
	const paths = [...DISALLOWED, ...DISALLOWED.map((path) => localizePath(path, 'en'))];
	return ['User-agent: *', ...paths.map((path) => `Disallow: ${path}`), '', `Sitemap: ${baseUrl}/sitemap.xml`, ''].join('\n');
}
