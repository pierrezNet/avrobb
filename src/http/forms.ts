/**
 * Lecture des formulaires HTML sans dépendance : application/x-www-form-urlencoded, et
 * multipart/form-data pour les envois de fichiers (Request.formData(), API Web disponible sous Node
 * comme dans un Worker). Un champ répété (cases à cocher « forums ») donne un tableau, comme dans la
 * chaîne de requête.
 */

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

/** Taille maximale d'un formulaire avec fichier (avatar, galerie, logo, bannière). */
export const MAX_UPLOAD_BYTES = 16 * 1_048_576;

/** Fichier reçu dans un formulaire multipart. */
export interface UploadedFile {
	/** Nom donné par le navigateur, à ne jamais utiliser tel quel comme chemin. */
	name: string;
	data: Buffer;
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

/** Erreur de lecture d'un formulaire, avec le statut HTTP à renvoyer. */
export class FormError extends Error {
	constructor(
		readonly statusCode: 400 | 413 | 415,
		message: string,
	) {
		super(message);
	}
}

/** Corps lu, au plus `limit` octets ; au-delà, 413 (le PHP s'arrêtait à PUN_MAX_POSTSIZE). */
async function readLimited(request: Request, limit: number): Promise<Uint8Array> {
	const declared = Number(request.headers.get('content-length') ?? '0');
	if (declared > limit) throw new FormError(413, 'Formulaire trop volumineux');
	const data = new Uint8Array(await request.arrayBuffer());
	if (data.byteLength > limit) throw new FormError(413, 'Formulaire trop volumineux');
	return data;
}

/**
 * Formulaire d'une requête : champs et fichiers. Sans corps, ou pour une méthode sans corps, rien.
 * Un type de contenu inconnu est refusé (415), un multipart illisible aussi (400).
 */
export async function readForm(request: Request): Promise<{ form: FormBody | undefined; files: Map<string, UploadedFile> }> {
	const files = new Map<string, UploadedFile>();
	if (request.method === 'GET' || request.method === 'HEAD' || request.body === null) return { form: undefined, files };

	const contentType = request.headers.get('content-type') ?? '';
	const mediaType = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
	if (mediaType === 'application/x-www-form-urlencoded') {
		const data = await readLimited(request, MAX_FORM_BYTES);
		return { form: parseFormBody(new TextDecoder().decode(data)), files };
	}
	if (mediaType === 'multipart/form-data') {
		const data = await readLimited(request, MAX_UPLOAD_BYTES);
		try {
			return await parseMultipartBody(Buffer.from(data), contentType);
		} catch {
			throw new FormError(400, 'Formulaire multipart illisible');
		}
	}
	if (mediaType === '') return { form: {}, files };
	throw new FormError(415, `Type de contenu non pris en charge : ${mediaType}`);
}
