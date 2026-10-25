/**
 * Lecture des formulaires HTML sans dépendance : application/x-www-form-urlencoded, et
 * multipart/form-data pour les envois de fichiers (Request.formData() de Node). Un champ répété
 * (cases à cocher « forums ») donne un tableau, comme dans la chaîne de requête.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';

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

/** Taille maximale d'un formulaire avec fichier (avatar, Uploadile). */
export const MAX_UPLOAD_BYTES = 16 * 1_048_576;

/** Fichier reçu dans un formulaire multipart. */
export interface UploadedFile {
	/** Nom donné par le navigateur, à ne jamais utiliser tel quel comme chemin. */
	name: string;
	data: Buffer;
}

declare module 'fastify' {
	interface FastifyRequest {
		/** Fichiers d'un formulaire multipart, par nom de champ (vide sinon). */
		uploads: ReadonlyMap<string, UploadedFile>;
	}
}

/** Champs texte et fichiers d'un corps multipart/form-data. */
export async function parseMultipartBody(body: Buffer, contentType: string): Promise<{ form: FormBody; files: Map<string, UploadedFile> }> {
	const data = await new Request('http://localhost/', {
		method: 'POST',
		headers: { 'content-type': contentType },
		body: new Uint8Array(body),
	}).formData();
	const form: FormBody = {};
	const files = new Map<string, UploadedFile>();
	for (const [key, value] of data) {
		if (typeof value !== 'string') {
			// Champ fichier laissé vide : le navigateur envoie un fichier sans nom ni contenu.
			if (value.name !== '' || value.size > 0) files.set(key, { name: value.name, data: Buffer.from(await value.arrayBuffer()) });
			continue;
		}
		const previous = form[key];
		form[key] = previous === undefined ? value : Array.isArray(previous) ? [...previous, value] : [previous, value];
	}
	return { form, files };
}

export function registerFormParser(app: FastifyInstance): void {
	app.decorateRequest('uploads', null as unknown as ReadonlyMap<string, UploadedFile>);
	app.addHook('onRequest', async (request) => {
		request.uploads = new Map();
	});
	app.addContentTypeParser(
		'multipart/form-data',
		{ parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES },
		(request: FastifyRequest, body: Buffer | string, done) => {
			parseMultipartBody(Buffer.isBuffer(body) ? body : Buffer.from(body), request.headers['content-type'] ?? '').then(
				({ form, files }) => {
					request.uploads = files;
					done(null, form);
				},
				(error: unknown) => {
					const failure = error instanceof Error ? error : new Error(String(error));
					done(Object.assign(failure, { statusCode: 400 }), undefined);
				},
			);
		},
	);

	app.addContentTypeParser(
		'application/x-www-form-urlencoded',
		{ parseAs: 'string', bodyLimit: MAX_FORM_BYTES },
		(_request, body, done) => {
			done(null, parseFormBody(String(body)));
		},
	);
}
