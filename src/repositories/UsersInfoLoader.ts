/**
 * Statistiques des membres comme index.php : lues dans cache/cache_users_info.php s'il existe (il
 * n'est régénéré qu'à l'inscription ou à la suppression d'un membre), sinon calculées en base.
 * Même principe d'invalidation que ConfigLoader : la date du fichier, ou 60 s pour la base.
 */

import type { UsersInfo } from '../domain/models.ts';
import { type PhpValue, parsePhpCacheVariable } from '../services/phpVarExport.ts';
import type { PhpCacheStore } from './PhpCacheFiles.ts';
import type { UsersInfoSource } from './StatsRepository.ts';

export interface UsersInfoReader {
	load(): Promise<UsersInfo>;
}

const DB_TTL = 60;

function fromPhp(value: PhpValue): UsersInfo {
	if (!(value instanceof Map)) throw new SyntaxError('$stats doit être un tableau');

	const lastUser = value.get('last_user');
	const id = lastUser instanceof Map ? Number(lastUser.get('id')) : 0;
	const username = lastUser instanceof Map ? String(lastUser.get('username') ?? '') : '';

	return { totalUsers: Number(value.get('total_users') ?? 0), newestUser: id > 0 ? { id, username } : null };
}

export class UsersInfoLoader implements UsersInfoReader {
	#cached: { version: number | null; loadedAt: number; info: UsersInfo } | null = null;

	constructor(
		private readonly source: UsersInfoSource,
		private readonly phpCache: PhpCacheStore | null,
		private readonly clock: () => number,
	) {}

	async load(): Promise<UsersInfo> {
		const version = (await this.phpCache?.version('users_info')) ?? null;
		const cached = this.#cached;

		if (cached !== null && version !== null && cached.version === version) return cached.info;
		if (cached !== null && version === null && cached.version === null && this.clock() - cached.loadedAt < DB_TTL) return cached.info;

		if (version !== null) {
			const file = await this.phpCache?.read('users_info');
			try {
				if (file !== null && file !== undefined) {
					const info = fromPhp(parsePhpCacheVariable(file.content, 'stats'));
					this.#cached = { version: file.version, loadedAt: this.clock(), info };
					return info;
				}
			} catch {
				// Fichier en cours d'écriture : on retombe sur la base sans retenir cette version.
			}
		}

		const info = await this.source.loadUsersInfo();
		this.#cached = { version: null, loadedAt: this.clock(), info };
		return info;
	}
}
