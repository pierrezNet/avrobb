/**
 * Adresses publiques d'AvroBB (« URL propres ») : source unique du schéma d'adresses. Le code garde
 * des cibles logiques héritées de FluxBB (`viewtopic.php?id=4`) ; `publicPath()` les traduit à un
 * seul endroit, utilisé par `url()` dans les vues, les redirections, le BBCode, les e-mails, le
 * plan du site et les flux. Plus aucune adresse `.php` n'est publiée : les anciennes restent servies,
 * et le Worker les redirige (301) vers la nouvelle.
 *
 *   /                       index.php
 *   /forum/2-avrobb         viewforum.php?id=2          /forum/2-avrobb/page/3   (&p=3)
 *   /sujet/4-premier-sujet  viewtopic.php?id=4          /sujet/4-premier-sujet/page/2
 *   /message/123            viewtopic.php?pid=123       (renvoie au message dans son sujet)
 *   /membre/3               profile.php?id=3            (fiche du membre seulement)
 *   les autres pages : table PAGES (/ecrire, /profil, /messages, /admin/membres…)
 *
 * Le slug (« -premier-sujet ») ne sert qu'à la lecture : seul le numéro identifie la page.
 *
 * Version anglaise sous /en/, avec des mots anglais (le préfixe seul ne suffirait pas : /forum,
 * /faq sont identiques) : /en/topic/4-first-topic, /en/member/3, /en/write… Le code produit
 * toujours les adresses françaises ; `localizePath()` les traduit à la sortie (vues, redirections,
 * URL canoniques) et `delocalizePath()` ramène une adresse anglaise reçue à son équivalent
 * français, que l'instance anglaise de l'application route comme l'instance française.
 *
 * Fonctions pures.
 */

/** Pages sans paramètre d'adresse : ancienne page, adresse française, adresse anglaise (sans /en). */
const PAGES: readonly (readonly [legacy: string, fr: string, en: string])[] = [
	['index.php', '/', '/'],
	['userlist.php', '/membres', '/members'],
	['search.php', '/recherche', '/search'],
	['gallery.php', '/galerie', '/gallery'],
	['help.php', '/aide', '/help'],
	['terms.php', '/conditions', '/terms'],
	['privacy.php', '/confidentialite', '/privacy'],
	['faq.php', '/faq', '/faq'],
	['stats.php', '/statistiques', '/statistics'],
	['login.php', '/connexion', '/login'],
	['post.php', '/ecrire', '/write'],
	['edit.php', '/modifier', '/edit'],
	['delete.php', '/supprimer', '/delete'],
	['moderate.php', '/moderation', '/moderation'],
	['misc.php', '/actions', '/actions'],
	['profile.php', '/profil', '/profile'],
	['pms_inbox.php', '/messages', '/messages'],
	['pms_send.php', '/messages/ecrire', '/messages/write'],
	['pms_view.php', '/messages/conversation', '/messages/conversation'],
	['draft_list.php', '/brouillons', '/drafts'],
	['draft_edit.php', '/brouillons/modifier', '/drafts/edit'],
	['reputation.php', '/renommee', '/reputation'],
	['topic_prefixes.php', '/balises', '/tags'],
	['push.php', '/notifications', '/notifications'],
	['member_suggest.php', '/membres/suggestions', '/members/suggestions'],
	['extern.php', '/flux', '/feed'],
	['feedback_accept.php', '/retours/accepter', '/feedback/accept'],
	['admin_index.php', '/admin', '/admin'],
	['admin_statistics.php', '/admin/statistiques', '/admin/statistics'],
	['admin_options.php', '/admin/options', '/admin/options'],
	['admin_categories.php', '/admin/categories', '/admin/categories'],
	['admin_forums.php', '/admin/forums', '/admin/forums'],
	['admin_groups.php', '/admin/groupes', '/admin/groups'],
	['admin_permissions.php', '/admin/permissions', '/admin/permissions'],
	['admin_users.php', '/admin/membres', '/admin/users'],
	['admin_bans.php', '/admin/bannissements', '/admin/bans'],
	['admin_censoring.php', '/admin/censure', '/admin/censoring'],
	['admin_reports.php', '/admin/signalements', '/admin/reports'],
	['admin_maintenance.php', '/admin/maintenance', '/admin/maintenance'],
	['admin_appearance.php', '/admin/apparence', '/admin/appearance'],
	['admin_pages.php', '/admin/pages', '/admin/pages'],
	['admin_loader.php', '/admin/extension', '/admin/extension'],
];

/** Pages d'extension de l'administration (admin_loader.php?plugin=…) : nom d'origine, adresses. */
export const PLUGIN_PAGES: readonly (readonly [plugin: string, fr: string, en: string])[] = [
	['AP_Balises.php', '/admin/balises', '/admin/tags'],
	['AP_Private_messaging.php', '/admin/messagerie', '/admin/private-messages'],
];

const STATIC_PAGES: Readonly<Record<string, string>> = Object.fromEntries(PAGES.map(([legacy, fr]) => [legacy, fr]));
const ALL_PAGES = [...PAGES.map(([, fr, en]) => [fr, en] as const), ...PLUGIN_PAGES.map(([, fr, en]) => [fr, en] as const)];
const EN_PAGES: Readonly<Record<string, string>> = Object.fromEntries(ALL_PAGES);
const FR_PAGES: Readonly<Record<string, string>> = Object.fromEntries(ALL_PAGES.map(([fr, en]) => [en, fr]));

/** Adresses propres → ancienne page, pour l'enregistrement des routes (app.ts). */
export const CLEAN_STATIC_PATHS: readonly (readonly [path: string, legacy: string])[] = Object.entries(STATIC_PAGES)
	.filter(([legacy]) => legacy !== 'index.php')
	.map(([legacy, path]) => [path, legacy] as const);

/** Longueur maximale d'un slug, en caractères. */
const SLUG_MAX = 60;

/** « Premier sujet sur D1 ! » → « premier-sujet-sur-d1 » : minuscules ASCII, accents retirés. */
export function slugify(text: string): string {
	const slug = text
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/œ/g, 'oe')
		.replace(/æ/g, 'ae')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug.length > SLUG_MAX ? slug.slice(0, SLUG_MAX).replace(/-+[^-]*$/, '') || slug.slice(0, SLUG_MAX) : slug;
}

function withSlug(prefix: string, id: number, title: string | null, page: number): string {
	const slug = title !== null ? slugify(title) : '';
	return `${prefix}/${id}${slug !== '' ? `-${slug}` : ''}${page > 1 ? `/page/${page}` : ''}`;
}

export function forumPath(id: number, name: string | null = null, page = 1): string {
	return withSlug('/forum', id, name, page);
}

export function topicPath(id: number, subject: string | null = null, page = 1): string {
	return withSlug('/sujet', id, subject, page);
}

export function postPath(postId: number): string {
	return `/message/${postId}#p${postId}`;
}

export function memberPath(id: number): string {
	return `/membre/${id}`;
}

/** Numéro en tête d'un segment d'adresse (« 4-premier-sujet » → 4) ; null s'il n'y en a pas. */
export function idFromSegment(segment: string | undefined): number | null {
	const match = /^(\d{1,10})(?:-[a-z0-9-]*)?$/.exec(segment ?? '');
	return match === null ? null : Number(match[1]);
}

const positive = (value: string | null): number | null =>
	value !== null && /^\d{1,10}$/.test(value) && Number(value) > 0 ? Number(value) : null;

/** Chaîne de requête restante (« ?a=1&b=2 »), vide s'il n'y a plus rien. */
function rest(params: URLSearchParams, used: readonly string[]): string {
	const kept = new URLSearchParams([...params].filter(([name]) => !used.includes(name)));
	const text = kept.toString();
	return text !== '' ? `?${text}` : '';
}

/**
 * Cible logique → adresse publique absolue sur le site (« /… »). Une adresse déjà absolue (« /… »,
 * « https://… ») est rendue telle quelle ; une page `.php` sans adresse propre reçoit seulement la
 * barre initiale, pour être juste depuis n'importe quelle page (« /sujet/4 » comprise).
 */
export function publicPath(target: string): string {
	if (target.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) return target;
	const hashAt = target.indexOf('#');
	const hash = hashAt >= 0 ? target.slice(hashAt) : '';
	const withoutHash = hashAt >= 0 ? target.slice(0, hashAt) : target;
	const queryAt = withoutHash.indexOf('?');
	const page = queryAt >= 0 ? withoutHash.slice(0, queryAt) : withoutHash;
	const params = new URLSearchParams(queryAt >= 0 ? withoutHash.slice(queryAt + 1) : '');

	if (page === '') return `/${rest(params, [])}${hash}`;
	const id = positive(params.get('id'));
	// Fiche d'un membre seulement : les sections et actions du profil vont sur /profil.
	if (page === 'profile.php' && id !== null && [...params.keys()].every((name) => name === 'id')) return `${memberPath(id)}${hash}`;
	const plugin = page === 'admin_loader.php' ? PLUGIN_PAGES.find(([name]) => name === params.get('plugin')) : undefined;
	if (plugin !== undefined) return `${plugin[1]}${rest(params, ['plugin'])}${hash}`;
	const fixed = STATIC_PAGES[page];
	if (fixed !== undefined) return `${fixed}${rest(params, [])}${hash}`;

	const pageNumber = positive(params.get('p')) ?? 1;
	if (page === 'viewforum.php' && id !== null) return `${forumPath(id, null, pageNumber)}${rest(params, ['id', 'p'])}${hash}`;
	if (page === 'viewtopic.php') {
		const postId = positive(params.get('pid'));
		if (postId !== null && id === null) return `/message/${postId}${rest(params, ['pid'])}${hash || `#p${postId}`}`;
		if (id !== null) return `${topicPath(id, null, pageNumber)}${rest(params, ['id', 'p'])}${hash}`;
	}
	return `/${withoutHash}${hash}`;
}

/** Adresse absolue avec le domaine du forum (e-mails, flux, plan du site, URL canonique). */
export function absoluteUrl(baseUrl: string, target: string, locale: Locale = 'fr'): string {
	const path = localizePath(publicPath(target), locale);
	return path.startsWith('/') ? `${baseUrl}${path}` : path;
}

/** Langues de l'interface : le français sans préfixe, l'anglais sous /en/. */
export type Locale = 'fr' | 'en';

const EN_PREFIX = '/en';

/** Premier segment des adresses à numéro (forum, sujet, message, membre) : français → anglais. */
const EN_SEGMENTS: Readonly<Record<string, string>> = {
	forum: 'forum',
	sujet: 'topic',
	message: 'post',
	membre: 'member',
};
const FR_SEGMENTS: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(EN_SEGMENTS).map(([fr, en]) => [en, fr]));

/** Adresse découpée en chemin et suite (« ?… », « #… »). */
function splitPath(path: string): { pathname: string; tail: string } {
	const at = path.search(/[?#]/);
	return at >= 0 ? { pathname: path.slice(0, at), tail: path.slice(at) } : { pathname: path, tail: '' };
}

/** Page fixe ou premier segment traduit, ancienne page `.php` gardée telle quelle ; null : adresse non traduite. */
function mapPath(pathname: string, pages: Readonly<Record<string, string>>, words: Readonly<Record<string, string>>): string | null {
	const page = pages[pathname];
	if (page !== undefined) return page;
	const match = /^\/([^/]+)(.*)$/.exec(pathname);
	if (match === null) return null;
	const [, segment = '', remainder = ''] = match;
	const word = words[segment];
	if (word !== undefined) return `/${word}${remainder}`;
	return /^[\w-]+\.php$/.test(segment) && remainder === '' ? pathname : null;
}

/**
 * Adresse française du site → adresse dans `locale`. Seules les pages du forum changent : fichiers
 * (/img/, /assets/), connexion OAuth (/auth/, adresse de retour fixe), robots.txt et plan du site
 * restent communs ; une adresse externe ou déjà anglaise est rendue telle quelle.
 */
export function localizePath(path: string, locale: Locale): string {
	if (locale === 'fr' || !path.startsWith('/') || path.startsWith('//')) return path;
	const { pathname, tail } = splitPath(path);
	if (pathname === EN_PREFIX || pathname.startsWith(`${EN_PREFIX}/`)) return path;
	if (pathname === '/') return `${EN_PREFIX}/${tail}`;
	const mapped = mapPath(pathname, EN_PAGES, EN_SEGMENTS);
	return mapped !== null ? `${EN_PREFIX}${mapped}${tail}` : path;
}

/** Adresse anglaise reçue (« /en/topic/4 ») → adresse française (« /sujet/4 ») ; null hors de /en/. */
export function delocalizePath(pathname: string): string | null {
	if (pathname === EN_PREFIX || pathname === `${EN_PREFIX}/`) return '/';
	if (!pathname.startsWith(`${EN_PREFIX}/`)) return null;
	const english = pathname.slice(EN_PREFIX.length);
	return mapPath(english, FR_PAGES, FR_SEGMENTS) ?? english;
}

/**
 * Ancienne adresse `.php` demandée (favori, lien d'un e-mail déjà envoyé) → nouvelle adresse dans la
 * langue de la page, ou null si elle n'en a pas (paramètres invalides : la page répond elle-même).
 */
export function legacyRedirect(pathname: string, search: string, locale: Locale): string | null {
	if (!/^\/[\w-]+\.php$/.test(pathname)) return null;
	const target = publicPath(`${pathname.slice(1)}${search}`);
	return target.split(/[?#]/)[0] === pathname ? null : localizePath(target, locale);
}
