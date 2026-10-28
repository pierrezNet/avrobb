/**
 * Fichiers des membres (plugin Uploadile de PV) : img/members/<id>/ dans l'installation PHP, servis
 * par elle. Les noms reçus sont réduits à leur basename() avant tout accès au disque.
 */

import type { Dirent } from 'node:fs';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { safeBaseName } from '../services/uploads.ts';

/** Dossier des fichiers, relatif à la racine du PHP (en dur dans UPP_Mes_uploads.php). */
export const MEMBER_UPLOADS_DIR = 'img/members';

export interface StoredFile {
	name: string;
	size: number;
	/** Date de modification, en secondes Unix (tri de la liste, du plus récent au plus ancien). */
	modified: number;
}

export interface UploadStore {
	/** Fichiers du dossier du membre (sous-dossiers exclus) ; null si le dossier n'existe pas. */
	list(userId: number): Promise<StoredFile[] | null>;
	exists(userId: number, fileName: string): Promise<boolean>;
	save(userId: number, fileName: string, data: Buffer): Promise<void>;
	/** Supprime un fichier ; faux s'il n'existait pas ou n'a pas pu l'être. */
	remove(userId: number, fileName: string): Promise<boolean>;
	/** Adresse publique d'un fichier. */
	urlFor(userId: number, fileName: string): string;
	/** Membres qui ont un dossier d'envoi (img/members/<id>/), par identifiant croissant. */
	listOwners(): Promise<number[]>;
}

export class MemberUploadFiles implements UploadStore {
	/**
	 * @param legacyRoot racine de l'installation PHP sur le disque
	 * @param legacyBaseUrl URL publique de cette installation
	 */
	constructor(
		private readonly legacyRoot: string,
		private readonly legacyBaseUrl: string,
	) {}

	async list(userId: number): Promise<StoredFile[] | null> {
		const dir = this.#directory(userId);
		let entries: string[];
		try {
			entries = await readdir(dir);
		} catch {
			return null;
		}
		const files: StoredFile[] = [];
		for (const name of entries) {
			const info = await stat(path.join(dir, name)).catch(() => null);
			if (info?.isFile() === true) files.push({ name, size: info.size, modified: Math.floor(info.mtimeMs / 1000) });
		}
		return files;
	}

	async exists(userId: number, fileName: string): Promise<boolean> {
		const file = this.#file(userId, fileName);
		return file !== null && (await stat(file).catch(() => null)) !== null;
	}

	async save(userId: number, fileName: string, data: Buffer): Promise<void> {
		const file = this.#file(userId, fileName);
		if (file === null) throw new Error('Nom de fichier refusé');
		await mkdir(this.#directory(userId), { recursive: true });
		// « wx » : ne jamais écraser un fichier existant (le contrôleur choisit un autre nom avant).
		await writeFile(file, data, { flag: 'wx' });
	}

	async remove(userId: number, fileName: string): Promise<boolean> {
		const file = this.#file(userId, fileName);
		if (file === null || (await stat(file).catch(() => null))?.isFile() !== true) return false;
		try {
			await rm(file);
			return true;
		} catch {
			return false;
		}
	}

	urlFor(userId: number, fileName: string): string {
		return `${this.legacyBaseUrl}/${MEMBER_UPLOADS_DIR}/${userId}/${encodeURIComponent(fileName)}`;
	}

	async listOwners(): Promise<number[]> {
		let entries: Dirent[];
		try {
			entries = await readdir(path.join(this.legacyRoot, MEMBER_UPLOADS_DIR), { withFileTypes: true });
		} catch {
			return [];
		}
		return entries
			.filter((entry) => entry.isDirectory() && /^\d{1,10}$/.test(entry.name))
			.map((entry) => Number(entry.name))
			.sort((a, b) => a - b);
	}

	#directory(userId: number): string {
		return path.join(this.legacyRoot, MEMBER_UPLOADS_DIR, String(Math.trunc(userId)));
	}

	#file(userId: number, fileName: string): string | null {
		const base = safeBaseName(fileName);
		return base === null ? null : path.join(this.#directory(userId), base);
	}
}
