/**
 * Adaptation Hono : enregistrement des routes du forum, étapes préalables (session, CSRF), erreurs,
 * en-têtes de sécurité et fichiers envoyés (R2). Chaque requête Hono devient un AppRequest et une
 * AppReply (http/context.ts) ; la réponse du contrôleur redevient une `Response`.
 */

import type { Context, Hono } from 'hono';
import type { BoardConfig, Viewer } from '../domain/models.ts';
import type { FileStore } from '../repositories/FileStore.ts';
import { AppReply, type AppReply as AppReplyType, type AppRequest, type Logger, parseCookieHeader, type RouteTypes } from './context.ts';
import { type FormBody, parseFormBody, readForm } from './forms.ts';
import { securityHeaders } from './securityHeaders.ts';

/**
 * Liaisons passées à app.fetch() : rien dans le Worker (l'adresse du client vient de
 * CF-Connecting-IP) ; les tests passent l'adresse du client (`remoteAddress`).
 */
export interface ForumBindings {
	remoteAddress?: string;
}

export type ForumApp = Hono<{ Bindings: ForumBindings }>;

export type Handler<T extends RouteTypes = RouteTypes> = (request: AppRequest<T>, reply: AppReplyType) => Promise<AppReplyType>;

/** Étape préalable : renvoie une réponse pour arrêter là (page de maintenance, refus CSRF…). */
export type PreHandler = (request: AppRequest, reply: AppReplyType) => Promise<AppReplyType | undefined>;

export type ErrorHandler = (error: unknown, request: AppRequest, reply: AppReplyType) => Promise<AppReplyType>;

export interface ServerOptions {
	logger: Logger;
	onError: ErrorHandler;
}

/**
 * Adresse du client : CF-Connecting-IP, posé par Cloudflare (et par wrangler dev), qui remplace
 * toute valeur envoyée par le client. Hors Cloudflare (tests), celle passée par app.fetch().
 */
function clientAddress(c: Context<{ Bindings: ForumBindings }>): string {
	return c.env?.remoteAddress ?? c.req.header('cf-connecting-ip') ?? '127.0.0.1';
}

function protocolOf(c: Context): 'http' | 'https' {
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
		ip: clientAddress(c),
		protocol: protocolOf(c),
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

/** En-têtes de sécurité sur toutes les réponses, fichiers envoyés et pages d'erreur compris. */
export function useSecurityHeaders(app: ForumApp): void {
	app.use('*', async (c, next) => {
		await next();
		const response = new Response(c.res.body, c.res);
		for (const [name, value] of Object.entries(securityHeaders(protocolOf(c) === 'https'))) response.headers.set(name, value);
		c.res = response;
	});
}

/** Types servis sous /img/ : rien d'autre que des images matricielles, même si R2 contenait autre chose. */
const SERVED_TYPES = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp']);

/**
 * Fichiers envoyés (galerie, avatars, logo, bannière), lus dans R2 sous `prefix` (« /img/ » → clé
 * « img/… »). Le type vient de R2 (fixé par le serveur à l'écriture) ; ETag et If-None-Match
 * évitent de renvoyer un fichier inchangé. Un fichier absent passe à la suite (page 404 du forum).
 */
export function serveStoredFiles(app: ForumApp, prefix: string, files: FileStore, cacheControl: string): void {
	app.on(['GET', 'HEAD'], `${prefix}*`, async (c, next) => {
		let key: string;
		try {
			key = decodeURIComponent(new URL(c.req.url).pathname.slice(1));
		} catch {
			return next();
		}
		// Clé fabriquée par le serveur : jamais de « .. », de double barre ni de caractère de contrôle.
		// biome-ignore lint/suspicious/noControlCharactersInRegex: on refuse justement les caractères de contrôle
		if (key.includes('..') || key.includes('//') || /[\x00-\x1f\\]/.test(key)) return next();
		const file = await files.get(key);
		if (file === null) return next();
		if (!SERVED_TYPES.has(file.contentType)) {
			await file.body.cancel();
			return next();
		}
		const headers = {
			'content-type': file.contentType,
			'cache-control': cacheControl,
			etag: file.etag,
			'content-disposition': 'inline',
		};
		if (c.req.header('if-none-match') === file.etag) {
			await file.body.cancel();
			return new Response(null, { status: 304, headers });
		}
		if (c.req.method === 'HEAD') {
			await file.body.cancel();
			return new Response(null, { headers: { ...headers, 'content-length': String(file.size) } });
		}
		return new Response(file.body, { headers: { ...headers, 'content-length': String(file.size) } });
	});
}
