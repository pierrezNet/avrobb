/**
 * Cache en bordure (Cache API de Cloudflare, `caches.default`) devant le Worker :
 *   - fichiers envoyés (/img/…) : publics, identiques pour tous, gardés une heure ;
 *   - pages vues par un visiteur sans aucun cookie du forum (ni session, ni jeton CSRF, ni suivi
 *     de lecture) : gardées PAGE_TTL secondes. Ces pages ne posent aucun cookie (le jeton CSRF n'est
 *     posé qu'aux pages de formulaire, voir app.ts) ; une réponse qui en pose un n'est jamais gardée.
 * Le navigateur, lui, redemande toujours une page (`private, no-cache`) : après sa connexion, le
 * membre ne revoit pas la version de l'invité. Conséquences assumées : une page publique peut avoir
 * une minute de retard, et un invité servi par le cache n'apparaît pas dans « En ce moment ».
 */

/**
 * Durée de conservation d'un fichier en bordure (secondes), plus courte que celle des navigateurs :
 * un fichier effacé (image retirée par la modération) disparaît en une heure au plus, la Cache API
 * ne permettant de purger que le centre de données courant.
 */
export const EDGE_TTL = 3600;
/** Durée de conservation d'une page publique : assez courte pour se passer de purge. */
export const PAGE_TTL = 60;
/** En-tête des pages renvoyées au navigateur : à revalider à chaque fois. */
export const PAGE_CACHE_CONTROL = 'private, no-cache';

/** Sous-ensemble de l'objet Cache des Workers utilisé ici. */
export interface EdgeCache {
	match(request: Request): Promise<Response | undefined>;
	put(request: Request, response: Response): Promise<void>;
}

const isFile = (url: URL): boolean => url.pathname.startsWith('/img/');

/** Le navigateur porte-t-il un cookie du forum (« <préfixe>_… », éventuellement __Host-) ? */
function hasForumCookie(request: Request, cookiePrefix: string): boolean {
	const header = request.headers.get('cookie') ?? '';
	return header.split(';').some((part) => {
		const name = part.split('=')[0]?.trim() ?? '';
		return name.replace(/^__(?:Host|Secure)-/, '').startsWith(`${cookiePrefix}_`);
	});
}

/** Requête que le cache peut servir : GET d'un fichier envoyé, ou d'une page par un visiteur sans cookie du forum. */
export function isEdgeCacheable(request: Request, cookiePrefix: string): boolean {
	if (request.method !== 'GET') return false;
	const url = new URL(request.url);
	return isFile(url) || !hasForumCookie(request, cookiePrefix);
}

const CACHED_PAGE_TYPES = /^(?:text\/html|application\/(?:rss\+)?xml|application\/atom\+xml|text\/xml|text\/plain)\b/;

/** Copie à garder en bordure, avec sa durée ; null si la réponse ne doit pas être gardée. */
function storedCopy(url: URL, response: Response): Response | null {
	if (response.status !== 200 || response.headers.has('set-cookie')) return null;
	const cacheControl = response.headers.get('cache-control') ?? '';
	if (cacheControl.includes('no-store')) return null;
	if (isFile(url)) {
		if (!cacheControl.includes('public')) return null;
	} else if (!CACHED_PAGE_TYPES.test(response.headers.get('content-type') ?? '')) return null;
	const stored = new Response(response.clone().body, response);
	stored.headers.set('cache-control', `public, max-age=${isFile(url) ? EDGE_TTL : PAGE_TTL}`);
	return stored;
}

/**
 * Réponse du cache si elle y est, sinon celle de `handler`, mise en cache en tâche de fond
 * (`waitUntil`) quand elle peut l'être.
 */
export async function withEdgeCache(
	request: Request,
	cache: EdgeCache,
	cookiePrefix: string,
	waitUntil: (promise: Promise<unknown>) => void,
	handler: () => Promise<Response>,
): Promise<Response> {
	if (!isEdgeCacheable(request, cookiePrefix)) return handler();
	const url = new URL(request.url);
	// Clé sans les en-têtes du visiteur : seule l'adresse compte.
	const key = new Request(url.toString(), { method: 'GET' });
	const cached = await cache.match(key);
	if (cached !== undefined) return isFile(url) ? cached : forBrowser(cached);

	const response = await handler();
	const stored = storedCopy(url, response);
	if (stored !== null) waitUntil(cache.put(key, stored));
	return response;
}

/** Page tirée du cache : le navigateur doit la redemander (sa durée en bordure ne le concerne pas). */
function forBrowser(response: Response): Response {
	const copy = new Response(response.body, response);
	copy.headers.set('cache-control', PAGE_CACHE_CONTROL);
	return copy;
}
