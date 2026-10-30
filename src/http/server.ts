/**
 * Adaptation Hono : enregistrement des routes du forum, étapes préalables (session, CSRF), erreurs,
 * en-têtes de sécurité et fichiers statiques. Chaque requête Hono devient un AppRequest et une
 * AppReply (http/context.ts) ; la réponse du contrôleur redevient une `Response`.
 *
 * Rien ici ne dépend de Node : le même code sert sous @hono/node-server (développement) et dans un
 * Worker (lot 3).
 */

import type { Context, Hono } from 'hono';
import type { BoardConfig, Viewer } from '../domain/models.ts';
import { AppReply, type AppReply as AppReplyType, type AppRequest, type Logger, parseCookieHeader, type RouteTypes } from './context.ts';
import { type FormBody, parseFormBody, readForm } from './forms.ts';
import { securityHeaders } from './securityHeaders.ts';

/**
 * Liaisons de l'environnement : sous Node, @hono/node-server passe la requête Node (`incoming`) ;
 * les tests passent l'adresse du client (`remoteAddress`).
 */
export interface ForumBindings {
	incoming?: { socket?: { remoteAddress?: string } };
	remoteAddress?: string;
}

export type ForumApp = Hono<{ Bindings: ForumBindings }>;

export type Handler<T extends RouteTypes = RouteTypes> = (request: AppRequest<T>, reply: AppReplyType) => Promise<AppReplyType>;

/** Étape préalable : renvoie une réponse pour arrêter là (page de maintenance, refus CSRF…). */
export type PreHandler = (request: AppRequest, reply: AppReplyType) => Promise<AppReplyType | undefined>;

export type ErrorHandler = (error: unknown, request: AppRequest, reply: AppReplyType) => Promise<AppReplyType>;

export interface ServerOptions {
	/** Derrière un proxy de confiance : adresse et protocole lus dans X-Forwarded-For / -Proto. */
	trustProxy: boolean;
	logger: Logger;
	onError: ErrorHandler;
}

/** Préfixe des ressources de public/ (CSS, scripts, icônes), versionnées par empreinte. */
export const ASSETS_PREFIX = '/assets/';

/** Fichiers servis tels quels (ressources de public/, images du stockage). */
export interface StaticFiles {
	get(path: string): Promise<{ data: Uint8Array<ArrayBuffer>; contentType: string } | null>;
}

function clientAddress(c: Context<{ Bindings: ForumBindings }>, trustProxy: boolean): string {
	if (trustProxy) {
		const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
		if (forwarded !== undefined && forwarded !== '') return forwarded;
	}
	return c.env?.remoteAddress ?? c.env?.incoming?.socket?.remoteAddress ?? '127.0.0.1';
}

function protocolOf(c: Context, trustProxy: boolean): 'http' | 'https' {
	if (trustProxy && c.req.header('x-forwarded-proto')?.split(',')[0]?.trim() === 'https') return 'https';
	return new URL(c.req.url).protocol === 'https:' ? 'https' : 'http';
}

/** Contexte de requête sans corps ; viewer et board sont posés par la session. */
function baseRequest(c: Context<{ Bindings: ForumBindings }>, options: ServerOptions): AppRequest {
	const url = new URL(c.req.url);
	const headers: Record<string, string> = {};
	c.req.raw.headers.forEach((value, name) => {
		headers[name] = value;
	});
	return {
		method: c.req.method,
		url: url.pathname + url.search,
		query: parseFormBody(url.search.slice(1)),
		body: undefined,
		headers,
		cookies: parseCookieHeader(headers.cookie),
		ip: clientAddress(c, options.trustProxy),
		protocol: protocolOf(c, options.trustProxy),
		uploads: new Map(),
		viewer: null as unknown as Viewer,
		board: null as unknown as BoardConfig,
		csrfToken: '',
		log: options.logger,
	};
}

/** Exécute une route : lecture du formulaire, étapes préalables, contrôleur ; toute erreur va à onError. */
async function run(
	c: Context<{ Bindings: ForumBindings }>,
	options: ServerOptions,
	preHandlers: readonly PreHandler[],
	handler: Handler,
): Promise<Response> {
	const request = baseRequest(c, options);
	const reply = new AppReply(options.logger);
	try {
		const { form, files } = await readForm(c.req.raw);
		request.body = form satisfies FormBody | undefined;
		request.uploads = files;
		for (const preHandler of preHandlers) {
			const stopped = await preHandler(request, reply);
			if (stopped !== undefined) return stopped.toResponse();
		}
		return (await handler(request, reply)).toResponse();
	} catch (error) {
		return (await options.onError(error, request, new AppReply(options.logger))).toResponse();
	}
}

export interface Router {
	get<T extends RouteTypes = RouteTypes>(path: string, preHandlers: readonly PreHandler[], handler: Handler<T>): void;
	post<T extends RouteTypes = RouteTypes>(path: string, preHandlers: readonly PreHandler[], handler: Handler<T>): void;
	/** Page introuvable : mêmes étapes préalables qu'une route (la page d'erreur a besoin de la session). */
	notFound(preHandlers: readonly PreHandler[], handler: Handler): void;
}

export function createRouter(app: ForumApp, options: ServerOptions): Router {
	// Les types de route ne servent qu'au contrôleur : ici, toutes les requêtes ont la même forme.
	const erase = <T extends RouteTypes>(handler: Handler<T>): Handler => handler as unknown as Handler;
	return {
		get: (path, preHandlers, handler) => {
			app.get(path, (c) => run(c, options, preHandlers, erase(handler)));
		},
		post: (path, preHandlers, handler) => {
			app.post(path, (c) => run(c, options, preHandlers, erase(handler)));
		},
		notFound: (preHandlers, handler) => {
			app.notFound((c) => run(c, options, preHandlers, handler));
		},
	};
}

/** En-têtes de sécurité sur toutes les réponses, fichiers statiques et pages d'erreur compris. */
export function useSecurityHeaders(app: ForumApp, trustProxy: boolean): void {
	app.use('*', async (c, next) => {
		await next();
		const response = new Response(c.res.body, c.res);
		for (const [name, value] of Object.entries(securityHeaders(protocolOf(c, trustProxy) === 'https'))) response.headers.set(name, value);
		c.res = response;
	});
}

/** Sert les fichiers de `files` sous `prefix` (« /assets/ ») ; un fichier absent passe à la suite. */
export function serveFiles(app: ForumApp, prefix: string, files: StaticFiles, cacheControl: string): void {
	app.get(`${prefix}*`, async (c, next) => {
		let path: string;
		try {
			path = decodeURIComponent(new URL(c.req.url).pathname.slice(prefix.length));
		} catch {
			return next();
		}
		const file = await files.get(path);
		if (file === null) return next();
		return new Response(file.data, { headers: { 'content-type': file.contentType, 'cache-control': cacheControl } });
	});
}
