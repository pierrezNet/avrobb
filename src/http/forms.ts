/**
 * Lecture des formulaires HTML (application/x-www-form-urlencoded) sans dépendance : un champ répété
 * (cases à cocher « forums ») donne un tableau, comme dans la chaîne de requête.
 */

import type { FastifyInstance } from 'fastify';

export type FormBody = Record<string, string | string[]>;

/** Taille maximale d'un formulaire (PUN_MAX_POSTSIZE du PHP : 1 Mio). */
export const MAX_FORM_BYTES = 1_048_576;

export function parseFormBody(body: string): FormBody {
	const form: FormBody = {};
	for (const [key, value] of new URLSearchParams(body)) {
		const previous = form[key];
		form[key] = previous === undefined ? value : Array.isArray(previous) ? [...previous, value] : [previous, value];
	}
	return form;
}

/** Valeur simple d'un champ (la dernière s'il est répété), ou chaîne vide. */
export function field(form: FormBody | undefined, name: string): string {
	const value = form?.[name];
	return Array.isArray(value) ? (value.at(-1) ?? '') : (value ?? '');
}

export function registerFormParser(app: FastifyInstance): void {
	app.addContentTypeParser(
		'application/x-www-form-urlencoded',
		{ parseAs: 'string', bodyLimit: MAX_FORM_BYTES },
		(_request, body, done) => {
			done(null, parseFormBody(String(body)));
		},
	);
}
