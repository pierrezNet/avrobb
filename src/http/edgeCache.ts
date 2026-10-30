/**
 * Cache en bordure (Cache API de Cloudflare, `caches.default`) devant le Worker. Pour l'instant,
 * seuls les fichiers envoyés (/img/…) y passent : publics, identiques pour tous et sans cookie. Les
 * pages des visiteurs non connectés suivront au lot 7 de TODO.md.
 */

/**
 * Durée de conservation en bordure (secondes), plus courte que celle des navigateurs : un fichier
 * effacé (image retirée par la modération) disparaît en une heure au plus, la Cache API ne
 * permettant de purger que le centre de données courant.
 */
export const EDGE_TTL = 3600;

/** Sous-ensemble de l'objet Cache des Workers utilisé ici. */
export interface EdgeCache {
	match(request: Request): Promise<Response | undefined>;
	put(request: Request, response: Response): Promise<void>;
}

/** Requête que le cache peut servir : GET d'un fichier envoyé. */
export function isEdgeCacheable(request: Request): boolean {
	return request.method === 'GET' && new URL(request.url).pathname.startsWith('/img/');
}

/**
 * Réponse du cache si elle y est, sinon celle de `handler`, mise en cache (en tâche de fond par
 * `waitUntil`, pour EDGE_TTL) si elle est publique, réussie et ne pose aucun cookie.
 */
export async function withEdgeCache(
	request: Request,
	cache: EdgeCache,
	waitUntil: (promise: Promise<unknown>) => void,
	handler: () => Promise<Response>,
): Promise<Response> {
	if (!isEdgeCacheable(request)) return handler();
	const cached = await cache.match(request);
	if (cached !== undefined) return cached;

	const response = await handler();
	const cacheControl = response.headers.get('cache-control') ?? '';
	if (response.status === 200 && cacheControl.includes('public') && !response.headers.has('set-cookie')) {
		const stored = new Response(response.clone().body, response);
		stored.headers.set('cache-control', `public, max-age=${EDGE_TTL}`);
		waitUntil(cache.put(request, stored));
	}
	return response;
}
