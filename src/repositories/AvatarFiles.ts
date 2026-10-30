/**
 * Avatars dans R2, comme dans FluxBB : un fichier <dossier>/<id>.(gif|jpg|png|webp), le dossier
 * étant o_avatars_dir (img/avatars). L'adresse porte la date du fichier (« ?m= », comme
 * generate_avatar_markup()) : un nouvel avatar n'est pas masqué par les caches.
 *
 * Une page affiche jusqu'à plusieurs dizaines d'avatars : plutôt qu'une lecture R2 par membre, la
 * liste du dossier est lue une fois puis gardée LIST_TTL secondes dans l'isolat. Un envoi ou un
 * effacement la vide aussitôt ici ; les autres isolats le voient au plus tard après LIST_TTL.
 */

import { avatarOwner } from '../services/fileCleanup.ts';
import { IMAGE_CONTENT_TYPES, type ImageType } from '../services/images.ts';
import type { FileStore } from './FileStore.ts';

const EXTENSIONS: readonly ImageType[] = ['gif', 'jpg', 'png', 'webp'];
const LIST_TTL = 60;
/** Dossier par défaut, et seule forme permise pour o_avatars_dir (lettres, chiffres, tirets sous img/). */
const DEFAULT_DIR = 'img/avatars';
const SAFE_DIR = /^img(?:\/[a-z0-9_-]+)+$/i;

export interface AvatarLocator {
	/** URL publique de l'avatar, ou null s'il n'y en a pas. */
	urlFor(userId: number, avatarsDir: string): Promise<string | null>;
}

export interface AvatarStore {
	/** Remplace l'avatar (l'ancien est effacé, quelle que soit son extension). */
	save(userId: number, avatarsDir: string, type: ImageType, data: Uint8Array): Promise<void>;
	/** delete_avatar() : efface l'avatar, quelle que soit son extension. */
	delete(userId: number, avatarsDir: string): Promise<void>;
}

/** Dossier des avatars : o_avatars_dir vient de la base, il ne doit désigner qu'un dossier sous img/. */
export function avatarsDirectory(avatarsDir: string): string {
	const dir = avatarsDir.replace(/\/+$/, '');
	return SAFE_DIR.test(dir) ? dir : DEFAULT_DIR;
}

export class AvatarFiles implements AvatarLocator, AvatarStore {
	#listing: { dir: string; loadedAt: number; urls: Promise<Map<number, string>> } | null = null;

	/** @param clock secondes Unix */
	constructor(
		private readonly files: FileStore,
		private readonly clock: () => number,
	) {}

	async urlFor(userId: number, avatarsDir: string): Promise<string | null> {
		return (await this.#urls(avatarsDirectory(avatarsDir))).get(userId) ?? null;
	}

	async save(userId: number, avatarsDir: string, type: ImageType, data: Uint8Array): Promise<void> {
		const dir = avatarsDirectory(avatarsDir);
		// L'ancien avatar d'une autre extension d'abord ; le nouveau remplace celui de même extension.
		await this.files.delete(EXTENSIONS.filter((ext) => ext !== type).map((ext) => `${dir}/${userId}.${ext}`));
		await this.files.put(`${dir}/${userId}.${type}`, data, IMAGE_CONTENT_TYPES[type]);
		this.#listing = null;
	}

	async delete(userId: number, avatarsDir: string): Promise<void> {
		const dir = avatarsDirectory(avatarsDir);
		await this.files.delete(EXTENSIONS.map((ext) => `${dir}/${userId}.${ext}`));
		this.#listing = null;
	}

	#urls(dir: string): Promise<Map<number, string>> {
		const listing = this.#listing;
		if (listing !== null && listing.dir === dir && this.clock() - listing.loadedAt < LIST_TTL) return listing.urls;
		const urls = this.#load(dir);
		this.#listing = { dir, loadedAt: this.clock(), urls };
		// Un échec de lecture ne reste pas en cache.
		urls.catch(() => {
			if (this.#listing?.urls === urls) this.#listing = null;
		});
		return urls;
	}

	async #load(dir: string): Promise<Map<number, string>> {
		const urls = new Map<number, string>();
		for (const file of await this.files.list(`${dir}/`)) {
			const owner = avatarOwner(file.key);
			if (owner !== null) urls.set(owner, `/${file.key}?m=${file.uploadedAt}`);
		}
		return urls;
	}
}
