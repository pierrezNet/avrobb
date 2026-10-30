/**
 * Fichiers servis depuis un dossier du disque (public/, img/ du stockage local), pour le serveur
 * Node de développement. Workers Static Assets (lot 3) et R2 (lot 4) le remplaceront.
 *
 * Aucun chemin ne sort du dossier ; seules les extensions connues sont servies, avec un type fixé
 * ici (jamais déduit du contenu ni du client).
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { StaticFiles } from '../http/server.ts';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
	css: 'text/css; charset=utf-8',
	js: 'text/javascript; charset=utf-8',
	json: 'application/json; charset=utf-8',
	svg: 'image/svg+xml',
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	ico: 'image/x-icon',
};

export class DirectoryFiles implements StaticFiles {
	readonly #root: string;

	/** @param allowed extensions servies (sans le point), par défaut toutes celles de CONTENT_TYPES */
	constructor(
		root: string,
		private readonly allowed: readonly string[] = Object.keys(CONTENT_TYPES),
	) {
		this.#root = path.resolve(root);
	}

	async get(file: string): Promise<{ data: Uint8Array<ArrayBuffer>; contentType: string } | null> {
		const absolute = path.resolve(this.#root, file);
		if (!absolute.startsWith(this.#root + path.sep)) return null;
		const extension = path.extname(absolute).slice(1).toLowerCase();
		const contentType = CONTENT_TYPES[extension];
		if (contentType === undefined || !this.allowed.includes(extension)) return null;
		const info = await stat(absolute).catch(() => null);
		if (info === null || !info.isFile()) return null;
		const data = await readFile(absolute);
		return { data: new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer), contentType };
	}
}
