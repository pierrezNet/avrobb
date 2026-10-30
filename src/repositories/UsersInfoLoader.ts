/**
 * Statistiques des membres de l'accueil (nombre, dernier inscrit), gardées en mémoire DB_TTL
 * secondes : elles ne changent qu'à la création ou à la suppression d'un compte.
 */

import type { UsersInfo } from '../domain/models.ts';
import type { UsersInfoSource } from './StatsRepository.ts';

export interface UsersInfoReader {
	load(): Promise<UsersInfo>;
}

const DB_TTL = 60;

export class UsersInfoLoader implements UsersInfoReader {
	#cached: { loadedAt: number; info: UsersInfo } | null = null;

	constructor(
		private readonly source: UsersInfoSource,
		private readonly clock: () => number,
	) {}

	async load(): Promise<UsersInfo> {
		const cached = this.#cached;
		if (cached !== null && this.clock() - cached.loadedAt < DB_TTL) return cached.info;

		const info = await this.source.loadUsersInfo();
		this.#cached = { loadedAt: this.clock(), info };
		return info;
	}
}
