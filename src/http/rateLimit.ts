/**
 * Limitation de débit par la liaison Rate Limiting de Workers (wrangler.jsonc, « ratelimits ») :
 * au-delà de la limite, page 429. Complète les délais anti-flood de FluxBB (g_post_flood,
 * g_search_flood), réglés par groupe et contournables en changeant de compte ou d'adresse.
 * Absente (tests, développement sans liaison) : rien n'est limité.
 */

import type { AppReply, AppRequest } from './context.ts';
import type { LayoutDeps } from './layout.ts';
import { renderMessage } from './layout.ts';

/** Liaison Rate Limiting de Workers (sous-ensemble). */
export interface RateLimiter {
	limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Clé : le membre connecté, sinon l'adresse IP (un invité partage la limite de son adresse). */
export function rateLimitKey(scope: string, request: AppRequest): string {
	return request.viewer.isGuest ? `${scope}:ip:${request.ip}` : `${scope}:user:${request.viewer.id}`;
}

/** Étape préalable : 429 quand la limite est atteinte. */
export function rateLimited(limiter: RateLimiter | undefined, scope: string, deps: LayoutDeps) {
	return async (request: AppRequest, reply: AppReply): Promise<AppReply | undefined> => {
		if (limiter === undefined || (await limiter.limit({ key: rateLimitKey(scope, request) })).success) return undefined;
		reply.header('retry-after', '60');
		return renderMessage(request, reply, deps, 429, deps.page.lang.common.tooManyRequests);
	};
}
