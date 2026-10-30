/**
 * Avatars, comme dans FluxBB : un fichier <id>.(gif|jpg|png|webp) dans o_avatars_dir, sous le
 * stockage local. Le chemin trouvé est mis en cache, oublié quand l'avatar est remplacé ou effacé.
 */

import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ImageType } from './images.ts';

const EXTENSIONS = ['gif', 'jpg', 'png'] as const;

export interface AvatarLocator {
	/** URL publique de l'avatar, ou null s'il n'y en a pas. */
	urlFor(userId: number, avatarsDir: string): Promise<string | null>;
}

export interface AvatarStore {
	/** Remplace l'avatar (delete_avatar() puis renommage du fichier temporaire, comme le PHP). */
	save(userId: number, avatarsDir: string, type: ImageType, data: Buffer): Promise<void>;
	/** delete_avatar() : efface l'avatar, quelle que soit son extension. */
	delete(userId: number, avatarsDir: string): Promise<void>;
}

export class FileAvatarLocator implements AvatarLocator, AvatarStore {
	readonly #cache = new Map<number, string | null>();

	/** @param storageRoot dossier de stockage local (STORAGE_DIR), dont img/ est servi sous /img/ */
	constructor(private readonly storageRoot: string) {}

	async urlFor(userId: number, avatarsDir: string): Promise<string | null> {
		if (this.#cache.has(userId)) return this.#cache.get(userId) ?? null;

		let url: string | null = null;

		for (const ext of EXTENSIONS) {
			const relative = `${avatarsDir.replace(/\/$/, '')}/${userId}.${ext}`;
			try {
				const info = await stat(path.join(this.storageRoot, relative));
				// « ?m= » + date du fichier, comme generate_avatar_markup() : un nouvel avatar n'est pas masqué par le cache.
				url = `/${relative}?m=${Math.floor(info.mtimeMs / 1000)}`;
				break;
			} catch {
				// Pas d'avatar avec cette extension.
			}
		}

		this.#cache.set(userId, url);
		return url;
	}

	async save(userId: number, avatarsDir: string, type: ImageType, data: Buffer): Promise<void> {
		const dir = this.#directory(avatarsDir);
		await mkdir(dir, { recursive: true });
		const temporary = path.join(dir, `${userId}.tmp`);
		await writeFile(temporary, data);
		await this.delete(userId, avatarsDir);
		await rename(temporary, path.join(dir, `${userId}.${type}`));
		this.#cache.delete(userId);
	}

	async delete(userId: number, avatarsDir: string): Promise<void> {
		const dir = this.#directory(avatarsDir);
		await Promise.all(EXTENSIONS.map((ext) => rm(path.join(dir, `${userId}.${ext}`), { force: true })));
		this.#cache.delete(userId);
	}

	/** Dossier des avatars, obligatoirement sous le stockage (o_avatars_dir vient de la base). */
	#directory(avatarsDir: string): string {
		const root = path.resolve(this.storageRoot);
		const dir = path.resolve(root, avatarsDir);
		if (dir !== root && !dir.startsWith(`${root}${path.sep}`)) throw new Error('o_avatars_dir sort de la racine du forum');
		return dir;
	}
}
