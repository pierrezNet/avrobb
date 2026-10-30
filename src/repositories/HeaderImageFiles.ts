/**
 * Fichiers du logo et de la bannière dans le stockage local (services/headerImages.ts) : écriture
 * avec copie de l'image précédente, retour à cette copie, et installation des images par défaut.
 */

import { copyFile, mkdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HEADER_IMAGES, type HeaderImageKind } from '../services/headerImages.ts';

export interface HeaderImageStore {
	/** Remplace l'image ; l'actuelle devient l'image précédente. */
	replace(kind: HeaderImageKind, data: Buffer): Promise<void>;
	/** Échange l'image et la précédente ; false s'il n'y a pas d'image précédente. */
	restore(kind: HeaderImageKind): Promise<boolean>;
	hasPrevious(kind: HeaderImageKind): Promise<boolean>;
}

const exists = async (file: string): Promise<boolean> => (await stat(file).catch(() => null)) !== null;

export class HeaderImageFiles implements HeaderImageStore {
	constructor(private readonly storageRoot: string) {}

	#paths(kind: HeaderImageKind): { current: string; previous: string } {
		const spec = HEADER_IMAGES[kind];
		return { current: path.join(this.storageRoot, spec.path), previous: path.join(this.storageRoot, spec.previousPath) };
	}

	/** Au démarrage : copie les images d'AvroBB (dossier public/) là où le stockage n'en a pas. */
	async installDefaults(publicDir: string): Promise<void> {
		for (const kind of Object.keys(HEADER_IMAGES) as HeaderImageKind[]) {
			const { current } = this.#paths(kind);
			if (await exists(current)) continue;
			await mkdir(path.dirname(current), { recursive: true });
			await copyFile(path.join(publicDir, HEADER_IMAGES[kind].defaultPath), current);
		}
	}

	async replace(kind: HeaderImageKind, data: Buffer): Promise<void> {
		const { current, previous } = this.#paths(kind);
		await mkdir(path.dirname(current), { recursive: true });
		if (await exists(current)) await copyFile(current, previous);
		// Fichier temporaire puis renommage : on ne sert jamais une image à moitié écrite.
		const temporary = `${current}.tmp`;
		await writeFile(temporary, data);
		await rename(temporary, current);
	}

	async restore(kind: HeaderImageKind): Promise<boolean> {
		const { current, previous } = this.#paths(kind);
		if (!(await exists(previous))) return false;
		const swap = `${current}.swap`;
		await copyFile(current, swap);
		await copyFile(previous, current);
		await rename(swap, previous);
		return true;
	}

	hasPrevious(kind: HeaderImageKind): Promise<boolean> {
		return exists(this.#paths(kind).previous);
	}
}
