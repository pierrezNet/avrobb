/**
 * Fichiers envoyés (galerie, avatars, logo, bannière) : interface `FileStore` et son implémentation
 * sur R2 (liaison FILES du Worker). Les clés sont toujours fabriquées par le serveur, jamais tirées
 * du nom envoyé ; le type MIME est fixé à l'écriture d'après le contenu (services/images.ts).
 *
 * Seul le sous-ensemble de l'API R2 utilisé ici est typé, comme pour D1 (src/db/d1.ts) : pas de
 * dépendance à @cloudflare/workers-types.
 */

export interface StoredFileInfo {
	key: string;
	contentType: string;
	size: number;
	/** ETag HTTP (entre guillemets), pour If-None-Match. */
	etag: string;
	/** Date d'écriture, en secondes Unix. */
	uploadedAt: number;
}

export interface StoredFile extends StoredFileInfo {
	body: ReadableStream<Uint8Array>;
}

export interface FileStore {
	put(key: string, data: Uint8Array, contentType: string): Promise<void>;
	get(key: string): Promise<StoredFile | null>;
	head(key: string): Promise<StoredFileInfo | null>;
	/** Tous les fichiers dont la clé commence par `prefix`. */
	list(prefix: string): Promise<StoredFileInfo[]>;
	delete(keys: readonly string[]): Promise<void>;
}

/** Sous-ensemble de R2Object / R2ObjectBody utilisé ici. */
interface R2ObjectLike {
	key: string;
	size: number;
	httpEtag: string;
	uploaded: Date;
	httpMetadata?: { contentType?: string };
}

interface R2ObjectBodyLike extends R2ObjectLike {
	body: ReadableStream<Uint8Array>;
}

/** Sous-ensemble de R2Bucket utilisé ici. */
export interface R2BucketLike {
	put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
	get(key: string): Promise<R2ObjectBodyLike | null>;
	head(key: string): Promise<R2ObjectLike | null>;
	list(options: { prefix: string; cursor?: string; limit?: number }): Promise<{
		objects: R2ObjectLike[];
		truncated: boolean;
		cursor?: string;
	}>;
	delete(keys: string | string[]): Promise<void>;
}

/** R2 accepte au plus 1 000 clés par suppression. */
const DELETE_BATCH = 1000;

function info(object: R2ObjectLike): StoredFileInfo {
	return {
		key: object.key,
		contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
		size: object.size,
		etag: object.httpEtag,
		uploadedAt: Math.floor(object.uploaded.getTime() / 1000),
	};
}

export class R2FileStore implements FileStore {
	/** @param pageSize clés par page de liste (1 000 au plus dans R2 ; plus petit dans les tests du curseur) */
	constructor(
		private readonly bucket: R2BucketLike,
		private readonly pageSize = 1000,
	) {}

	async put(key: string, data: Uint8Array, contentType: string): Promise<void> {
		await this.bucket.put(key, data, { httpMetadata: { contentType } });
	}

	async get(key: string): Promise<StoredFile | null> {
		const object = await this.bucket.get(key);
		return object === null ? null : { ...info(object), body: object.body };
	}

	async head(key: string): Promise<StoredFileInfo | null> {
		const object = await this.bucket.head(key);
		return object === null ? null : info(object);
	}

	async list(prefix: string): Promise<StoredFileInfo[]> {
		const files: StoredFileInfo[] = [];
		let cursor: string | undefined;
		do {
			const page = await this.bucket.list(
				cursor === undefined ? { prefix, limit: this.pageSize } : { prefix, cursor, limit: this.pageSize },
			);
			files.push(...page.objects.map(info));
			cursor = page.truncated ? page.cursor : undefined;
		} while (cursor !== undefined);
		return files;
	}

	async delete(keys: readonly string[]): Promise<void> {
		for (let start = 0; start < keys.length; start += DELETE_BATCH) await this.bucket.delete(keys.slice(start, start + DELETE_BATCH));
	}
}
