/**
 * Avatars FluxBB : un fichier <id>.(gif|jpg|png) dans o_avatars_dir de l'installation PHP.
 * Le chemin trouvé est mis en cache (les avatars changent rarement ; redémarrer pour rafraîchir).
 */

import { access } from 'node:fs/promises';
import path from 'node:path';

const EXTENSIONS = ['gif', 'jpg', 'png'] as const;

export interface AvatarLocator {
	/** URL publique de l'avatar, ou null s'il n'y en a pas. */
	urlFor(userId: number, avatarsDir: string): Promise<string | null>;
}

export class FileAvatarLocator implements AvatarLocator {
	readonly #cache = new Map<number, string | null>();

	/**
	 * @param legacyRoot racine de l'installation PHP sur le disque
	 * @param legacyBaseUrl URL publique de cette installation
	 */
	constructor(
		private readonly legacyRoot: string,
		private readonly legacyBaseUrl: string,
	) {}

	async urlFor(userId: number, avatarsDir: string): Promise<string | null> {
		if (this.#cache.has(userId)) return this.#cache.get(userId) ?? null;

		let url: string | null = null;

		for (const ext of EXTENSIONS) {
			const relative = `${avatarsDir.replace(/\/$/, '')}/${userId}.${ext}`;
			try {
				await access(path.join(this.legacyRoot, relative));
				url = `${this.legacyBaseUrl}/${relative}`;
				break;
			} catch {
				// Pas d'avatar avec cette extension.
			}
		}

		this.#cache.set(userId, url);
		return url;
	}
}
