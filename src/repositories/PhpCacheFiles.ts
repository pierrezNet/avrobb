/**
 * Fichiers de cache de l'installation PHP (cache/cache_<nom>.php, voir include/cache.php).
 *
 * Node les lit pour afficher exactement ce que voit le PHP, et les supprime pour invalider un cache
 * après une écriture : PHP les régénère alors à la requête suivante (comme le bouton « Vider le
 * cache » d'admin_maintenance.php).
 */

import { readdir, readFile, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

/** Noms de caches de FluxBB et de ses mods : sert aussi de garde contre la traversée de chemin. */
export type PhpCacheName = 'config' | 'bans' | 'censoring' | 'forums' | 'smilies' | 'users_info' | 'admins' | `quickjump_${number}`;

export interface PhpCacheFile {
	content: string;
	/** Date de modification (ms) : change à chaque régénération par PHP. */
	version: number;
}

export interface PhpCacheStore {
	/** Date de modification du fichier, ou null s'il n'existe pas. */
	version(name: PhpCacheName): Promise<number | null>;
	read(name: PhpCacheName): Promise<PhpCacheFile | null>;
	/** Supprime le fichier (sans erreur s'il est déjà absent). */
	invalidate(name: PhpCacheName): Promise<void>;
	/**
	 * Supprime toute une famille de fichiers : flux (cache_feed*.php, clear_feed_cache()) ou listes
	 * « Atteindre » de chaque groupe (cache_quickjump_*.php, que generate_quickjump_cache() réécrit).
	 */
	invalidateFamily(family: 'feed' | 'quickjump'): Promise<void>;
}

const isMissing = (error: unknown): boolean => error instanceof Error && 'code' in error && error.code === 'ENOENT';

export class PhpCacheFiles implements PhpCacheStore {
	constructor(private readonly cacheDir: string) {}

	#path(name: PhpCacheName): string {
		if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Nom de cache PHP invalide : ${name}`);
		return path.join(this.cacheDir, `cache_${name}.php`);
	}

	async version(name: PhpCacheName): Promise<number | null> {
		try {
			return (await stat(this.#path(name))).mtimeMs;
		} catch (error) {
			if (isMissing(error)) return null;
			throw error;
		}
	}

	async read(name: PhpCacheName): Promise<PhpCacheFile | null> {
		const file = this.#path(name);
		try {
			const version = (await stat(file)).mtimeMs;
			return { content: await readFile(file, 'utf8'), version };
		} catch (error) {
			if (isMissing(error)) return null;
			throw error;
		}
	}

	async invalidate(name: PhpCacheName): Promise<void> {
		try {
			await unlink(this.#path(name));
		} catch (error) {
			if (!isMissing(error)) throw error;
		}
	}

	async invalidateFamily(family: 'feed' | 'quickjump'): Promise<void> {
		let entries: string[];
		try {
			entries = await readdir(this.cacheDir);
		} catch (error) {
			if (isMissing(error)) return;
			throw error;
		}
		for (const entry of entries) {
			if (!entry.startsWith(`cache_${family}`) || !/^[A-Za-z0-9_]+\.php$/.test(entry)) continue;
			try {
				await unlink(path.join(this.cacheDir, entry));
			} catch (error) {
				if (!isMissing(error)) throw error;
			}
		}
	}
}
