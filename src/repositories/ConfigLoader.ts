/**
 * Réglages du forum (table config), gardés en mémoire DB_TTL secondes : chaque requête en a besoin,
 * et ils ne changent que par l'administration. Une écriture de ce processus appelle invalidate() ;
 * un autre processus (ou isolat Workers, au lot 3) voit le changement au plus tard après DB_TTL.
 */

import type { BoardConfig } from '../domain/models.ts';
import { toBoardConfig } from '../services/boardConfig.ts';
import type { ConfigSource } from './ConfigRepository.ts';

export interface ConfigReader {
	load(): Promise<BoardConfig>;
}

export interface ConfigCache {
	invalidate(): Promise<void>;
}

const DB_TTL = 30;

export class ConfigLoader implements ConfigReader, ConfigCache {
	#cached: { loadedAt: number; config: BoardConfig } | null = null;

	/** @param clock secondes Unix */
	constructor(
		private readonly table: ConfigSource,
		private readonly clock: () => number,
	) {}

	async load(): Promise<BoardConfig> {
		const cached = this.#cached;
		if (cached !== null && this.clock() - cached.loadedAt < DB_TTL) return cached.config;

		const config = toBoardConfig(await this.table.loadValues());
		this.#cached = { loadedAt: this.clock(), config };
		return config;
	}

	async invalidate(): Promise<void> {
		this.#cached = null;
	}
}
