/**
 * Requête et réponse vues par les contrôleurs : un contexte maison, indépendant du framework HTTP.
 * Hono (http/server.ts) construit l'un et transforme l'autre en `Response` ; les contrôleurs n'en
 * savent rien et passeront tels quels de Node à Cloudflare Workers.
 *
 * La forme reprend ce que les contrôleurs utilisaient de Fastify (`request.query`, `reply.code()`,
 * `reply.redirect()`…) pour que le changement de framework ne touche pas leur code.
 */

import type { BoardConfig, Viewer } from '../domain/models.ts';
import type { UploadedFile } from './forms.ts';

/** Paramètres de type d'une route : sa chaîne de requête et son corps, comme les routes Fastify. */
export interface RouteTypes {
	Querystring?: unknown;
	Body?: unknown;
}

/** Journal minimal ; `error` pour les incidents, `info` pour les refus attendus. */
/** Contexte d'une ligne de journal : `err` pour une erreur, d'autres champs au besoin. */
export type LogContext = { err?: unknown } & Record<string, unknown>;

export interface Logger {
	error(context: LogContext, message: string): void;
	info(context: LogContext, message: string): void;
}

export interface AppRequest<T extends RouteTypes = RouteTypes> {
	method: string;
	/** Chemin et chaîne de requête (« /viewtopic.php?id=4 »). */
	url: string;
	/** Paramètres de la chaîne de requête ; un paramètre répété donne un tableau. */
	query: T extends { Querystring?: infer Q } ? Q : unknown;
	/** Champs d'un formulaire POST (urlencoded ou multipart) ; undefined sans corps. */
	body: T extends { Body?: infer B } ? B : unknown;
	/** En-têtes, noms en minuscules. */
	headers: Readonly<Record<string, string | undefined>>;
	/** Cookies reçus ; le jeton CSRF y ajoute son secret quand il vient d'être créé. */
	cookies: Record<string, string | undefined>;
	/** Adresse du client (CF-Connecting-IP, posé par Cloudflare). */
	ip: string;
	protocol: 'http' | 'https';
	/** Fichiers d'un formulaire multipart, par nom de champ. */
	uploads: ReadonlyMap<string, UploadedFile>;
	/** Visiteur et réglages, posés par la session avant le contrôleur (http/session.ts). */
	viewer: Viewer;
	board: BoardConfig;
	csrfToken: string;
	log: Logger;
	/**
	 * Tâche à finir après la réponse (envoi d'e-mails) : ctx.waitUntil() dans le Worker, qui garde
	 * l'isolat en vie jusqu'à la fin de la tâche ; ailleurs (tests), la tâche suit simplement son cours.
	 */
	waitUntil(task: Promise<unknown>): void;
}

export interface CookieOptions {
	path?: string;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: 'lax' | 'strict';
	maxAge?: number;
	expires?: Date;
}

/** Cookie au format Set-Cookie ; valeur encodée comme le faisait @fastify/cookie. */
export function serializeCookie(name: string, value: string, options: CookieOptions): string {
	const parts = [`${name}=${encodeURIComponent(value)}`];
	if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.trunc(options.maxAge)}`);
	if (options.path !== undefined) parts.push(`Path=${options.path}`);
	if (options.expires !== undefined) parts.push(`Expires=${options.expires.toUTCString()}`);
	if (options.httpOnly === true) parts.push('HttpOnly');
	if (options.secure === true) parts.push('Secure');
	if (options.sameSite !== undefined) parts.push(`SameSite=${options.sameSite === 'lax' ? 'Lax' : 'Strict'}`);
	return parts.join('; ');
}

/** En-tête Cookie → valeurs décodées (une valeur mal encodée est gardée telle quelle). */
export function parseCookieHeader(header: string | undefined): Record<string, string> {
	const cookies: Record<string, string> = {};
	for (const pair of (header ?? '').split(';')) {
		const index = pair.indexOf('=');
		if (index <= 0) continue;
		const name = pair.slice(0, index).trim();
		const raw = pair.slice(index + 1).trim();
		if (name === '' || name in cookies) continue;
		try {
			cookies[name] = decodeURIComponent(raw);
		} catch {
			cookies[name] = raw;
		}
	}
	return cookies;
}

/**
 * Réponse en construction. Les méthodes s'enchaînent (`reply.code(404).send(…)`) et renvoient la
 * réponse elle-même, que le contrôleur retourne ; http/server.ts en fait une `Response`.
 */
export class AppReply {
	statusCode = 200;
	readonly headers = new Headers();
	/** Cookies à poser, par nom et chemin : le dernier posé l'emporte, comme avec @fastify/cookie. */
	readonly #cookies = new Map<string, string>();
	body: string | Uint8Array<ArrayBuffer> | null = null;

	constructor(readonly log: Logger) {}

	code(status: number): this {
		this.statusCode = status;
		return this;
	}

	type(contentType: string): this {
		this.headers.set('content-type', contentType);
		return this;
	}

	header(name: string, value: string): this {
		this.headers.set(name, value);
		return this;
	}

	/** Redirection vers `url`, telle quelle (une adresse relative reste relative). */
	redirect(url: string, status = 302): this {
		this.statusCode = status;
		this.headers.set('location', url);
		return this;
	}

	send(body: string | Uint8Array<ArrayBuffer>): this {
		this.body = body;
		return this;
	}

	/** Corps JSON (complètement des noms de membres). */
	json(data: unknown): this {
		return this.type('application/json; charset=utf-8').send(JSON.stringify(data));
	}

	setCookie(name: string, value: string, options: CookieOptions): this {
		this.#cookies.set(`${name};${options.path ?? ''}`, serializeCookie(name, value, options));
		return this;
	}

	clearCookie(name: string, options: CookieOptions): this {
		return this.setCookie(name, '', { ...options, expires: new Date(0) });
	}

	toResponse(): Response {
		const headers = new Headers(this.headers);
		for (const cookie of this.#cookies.values()) headers.append('set-cookie', cookie);
		// Le constructeur de Response refuse un corps sur 204 et 304.
		const body = this.statusCode === 204 || this.statusCode === 304 ? null : this.body;
		return new Response(body, { status: this.statusCode, headers });
	}
}
