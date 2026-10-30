/**
 * Requêtes de test sur l'application Hono, avec la forme de réponse des tests écrits pour Fastify
 * (`statusCode`, `headers` en minuscules, `body` en texte, `json()`) : un en-tête Set-Cookie unique
 * est une chaîne, plusieurs donnent un tableau, comme `app.inject()` de Fastify.
 */

import type { ForumApp } from '../src/app.ts';

export interface InjectOptions {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	payload?: string | Buffer;
	/** Adresse du client vue par le forum (127.0.0.1 par défaut, comme Fastify). */
	remoteAddress?: string;
}

export interface InjectResponse {
	statusCode: number;
	headers: Record<string, string | string[] | undefined>;
	body: string;
	json(): unknown;
}

export async function inject(app: ForumApp, options: InjectOptions | string): Promise<InjectResponse> {
	const {
		url,
		method = 'GET',
		headers = {},
		payload,
		remoteAddress = '127.0.0.1',
	} = typeof options === 'string' ? { url: options } : options;
	const host = headers.host ?? 'localhost:80';
	const init: RequestInit = { method, headers: { host, ...headers } };
	if (payload !== undefined) init.body = typeof payload === 'string' ? payload : new Uint8Array(payload);
	const response = await app.fetch(new Request(`http://${host}${url}`, init), { remoteAddress });

	const responseHeaders: Record<string, string | string[] | undefined> = {};
	response.headers.forEach((value, name) => {
		if (name !== 'set-cookie') responseHeaders[name] = value;
	});
	const cookies = response.headers.getSetCookie();
	if (cookies.length > 0) responseHeaders['set-cookie'] = cookies.length === 1 ? cookies[0] : cookies;

	const body = await response.text();
	return { statusCode: response.status, headers: responseHeaders, body, json: () => JSON.parse(body) };
}
