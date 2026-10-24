/**
 * Réglages du forum, lus comme le fait common.php : depuis cache/cache_config.php s'il existe,
 * sinon depuis la table config (que PHP recopiera dans le cache à sa prochaine requête).
 *
 * Mise en cache mémoire avec invalidation :
 * - source fichier : gardée tant que la date de modification du fichier ne change pas (un simple
 *   stat par requête ; PHP réécrit le fichier après chaque modification dans l'administration) ;
 * - source base : gardée DB_TTL secondes, faute de signal de changement ;
 * - invalidate() : à appeler après une écriture de Node dans config. Supprime aussi le cache PHP.
 */

import type { BoardConfig } from '../domain/models.ts';
import { toBoardConfig } from '../services/boardConfig.ts';
import { parsePhpCacheVariable, toStringMap } from '../services/phpVarExport.ts';
import type { ConfigSource } from './ConfigRepository.ts';
import type { PhpCacheStore } from './PhpCacheFiles.ts';

export interface ConfigReader {
	load(): Promise<BoardConfig>;
}

export interface ConfigCache {
	invalidate(): Promise<void>;
}

const DB_TTL = 10;

type Cached = { source: 'file'; version: number; config: BoardConfig } | { source: 'db'; loadedAt: number; config: BoardConfig };

export class ConfigLoader implements ConfigReader, ConfigCache {
	#cached: Cached | null = null;

	/**
	 * @param phpCache null si l'installation PHP n'est pas accessible sur le disque
	 * @param clock secondes Unix
	 */
	constructor(
		private readonly table: ConfigSource,
		private readonly phpCache: PhpCacheStore | null,
		private readonly clock: () => number,
	) {}

	async load(): Promise<BoardConfig> {
		const fromFile = await this.#loadFromPhpCache();
		if (fromFile !== null) return fromFile;

		const cached = this.#cached;
		if (cached?.source === 'db' && this.clock() - cached.loadedAt < DB_TTL) return cached.config;

		const config = toBoardConfig(await this.table.loadValues());
		this.#cached = { source: 'db', loadedAt: this.clock(), config };
		return config;
	}

	async invalidate(): Promise<void> {
		this.#cached = null;
		await this.phpCache?.invalidate('config');
	}

	async #loadFromPhpCache(): Promise<BoardConfig | null> {
		if (this.phpCache === null) return null;

		const version = await this.phpCache.version('config');
		if (version === null) return null;

		const cached = this.#cached;
		if (cached?.source === 'file' && cached.version === version) return cached.config;

		const file = await this.phpCache.read('config');
		if (file === null) return null;

		try {
			const config = toBoardConfig(toStringMap(parsePhpCacheVariable(file.content, 'pun_config')));
			this.#cached = { source: 'file', version: file.version, config };
			return config;
		} catch {
			// Fichier en cours de réécriture par PHP (fluxbb_write_cache_file() n'est pas atomique) ou
			// format inattendu : on lit la base, sans retenir cette version du fichier.
			return null;
		}
	}
}
