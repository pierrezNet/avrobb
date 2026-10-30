/**
 * Fichiers orphelins de R2 (tâche planifiée) : images de la galerie sans ligne en base, avatars de
 * membres supprimés. Un fichier est écrit avant sa ligne en base (galerie) et effacé après elle : un
 * fichier trop récent peut donc appartenir à un envoi en cours, il est laissé jusqu'au passage suivant.
 * Fonctions pures.
 */

import { MOBILE_PREFIX } from './imageVariants.ts';

/** Âge minimal d'un fichier orphelin avant effacement : un jour. */
export const ORPHAN_MIN_AGE = 86400;

export interface FileEntry {
	key: string;
	/** Date d'écriture, en secondes Unix. */
	uploadedAt: number;
}

const old = (file: FileEntry, now: number): boolean => now - file.uploadedAt >= ORPHAN_MIN_AGE;

/** Fichiers de `galleryDir` (image, vignette mini_, variante mobile_) dont l'image n'est plus en base. */
export function orphanGalleryKeys(files: readonly FileEntry[], galleryDir: string, known: ReadonlySet<string>, now: number): string[] {
	return files
		.filter((file) => {
			const name = file.key.slice(galleryDir.length + 1);
			const image = name.startsWith('mini_') ? name.slice(5) : name.startsWith(MOBILE_PREFIX) ? name.slice(MOBILE_PREFIX.length) : name;
			return !known.has(image) && old(file, now);
		})
		.map((file) => file.key);
}

/** Identifiant du membre d'après la clé de son avatar (« img/avatars/12.png »), ou null. */
export function avatarOwner(key: string): number | null {
	const match = /\/(\d{1,10})\.(?:gif|jpg|png|webp)$/.exec(key);
	return match !== null ? Number(match[1]) : null;
}

/** Avatars dont le membre n'existe plus (ou fichier qui n'est pas un avatar). */
export function orphanAvatarKeys(files: readonly FileEntry[], existing: ReadonlySet<number>, now: number): string[] {
	return files
		.filter((file) => {
			const owner = avatarOwner(file.key);
			return (owner === null || !existing.has(owner)) && old(file, now);
		})
		.map((file) => file.key);
}
