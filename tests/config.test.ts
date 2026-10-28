/**
 * Configuration du forum : lecture des caches PHP (var_export), conversion typée, cache mémoire
 * et invalidation.
 */

import { describe, expect, it } from 'vitest';
import { ConfigLoader } from '../src/repositories/ConfigLoader.ts';
import type { PhpCacheName, PhpCacheStore } from '../src/repositories/PhpCacheFiles.ts';
import { UsersInfoLoader } from '../src/repositories/UsersInfoLoader.ts';
import { toBoardConfig } from '../src/services/boardConfig.ts';
import { parsePhpCacheVariable, toStringMap } from '../src/services/phpVarExport.ts';

const CACHE_CONFIG = `<?php

define('PUN_CONFIG_LOADED', 1);

$pun_config = array (
  'o_board_title' => 'Pilote-Virtuel.com - Forum de simulation aérienne',
  'o_board_desc' => 'L\\'air \\\\ le ciel',
  'o_default_style' => 'GreenDark',
  'o_feed_type' => '2',
  'o_smtp_host' => NULL,
  'o_announcement' => '1',
  'o_announcement_message' => '<p>Annonce</p>',
);

?>`;

describe('parsePhpCacheVariable', () => {
	it('lit le tableau var_export() de cache_config.php', () => {
		const values = toStringMap(parsePhpCacheVariable(CACHE_CONFIG, 'pun_config'));
		expect(values.get('o_board_title')).toBe('Pilote-Virtuel.com - Forum de simulation aérienne');
		expect(values.get('o_board_desc')).toBe("L'air \\ le ciel");
		expect(values.get('o_smtp_host')).toBe('');
	});

	it('lit les tableaux imbriqués et les nombres (cache_users_info.php)', () => {
		const source =
			"$stats = array (\n  'total_users' => '5',\n  'last_user' => \n  array (\n    'id' => 2,\n    'ratio' => -1.5,\n  ),\n);";
		const stats = parsePhpCacheVariable(source, 'stats');
		expect(stats).toEqual(
			new Map<string | number, unknown>([
				['total_users', '5'],
				[
					'last_user',
					new Map<string, unknown>([
						['id', 2],
						['ratio', -1.5],
					]),
				],
			]),
		);
	});

	it("refuse ce qui n'est pas du var_export (jamais d'évaluation de PHP)", () => {
		expect(() => parsePhpCacheVariable("$pun_config = array ('a' => phpinfo());", 'pun_config')).toThrow(SyntaxError);
		expect(() => parsePhpCacheVariable("$pun_config = array ('a' => 'tronqu", 'pun_config')).toThrow(SyntaxError);
		expect(() => parsePhpCacheVariable('<?php echo 1;', 'pun_config')).toThrow(SyntaxError);
	});
});

describe('toBoardConfig', () => {
	it('convertit les options en réglages typés', () => {
		const config = toBoardConfig(toStringMap(parsePhpCacheVariable(CACHE_CONFIG, 'pun_config')));
		expect(config).toMatchObject({ defaultStyle: 'GreenDark', feedType: 'atom', announcement: '<p>Annonce</p>', reportsByBoard: true });
		expect(toBoardConfig(new Map([['o_report_method', '1']])).reportsByBoard).toBe(false);
		expect(toBoardConfig(new Map()).announcement).toBeNull();
	});
});

/** Cache PHP en mémoire : `files` simule le dossier cache/ (contenu + date de modification). */
class FakeCacheStore implements PhpCacheStore {
	readonly files = new Map<PhpCacheName, { content: string; version: number }>();
	reads = 0;

	async version(name: PhpCacheName): Promise<number | null> {
		return this.files.get(name)?.version ?? null;
	}

	async read(name: PhpCacheName) {
		this.reads++;
		return this.files.get(name) ?? null;
	}

	async invalidate(name: PhpCacheName): Promise<void> {
		this.files.delete(name);
	}

	async invalidateFeeds(): Promise<void> {}
}

function setup() {
	let now = 1000;
	let dbReads = 0;
	const dbValues = new Map([['o_board_title', 'Titre en base']]);
	const store = new FakeCacheStore();
	const loader = new ConfigLoader(
		{
			loadValues: async () => {
				dbReads++;
				return dbValues;
			},
		},
		store,
		() => now,
	);
	return { loader, store, dbValues, tick: (s: number) => (now += s), dbReads: () => dbReads };
}

describe('ConfigLoader', () => {
	it('lit le cache PHP et ne le relit que si sa date change', async () => {
		const { loader, store, dbReads } = setup();
		store.files.set('config', { content: CACHE_CONFIG, version: 1 });

		expect((await loader.load()).boardTitle).toBe('Pilote-Virtuel.com - Forum de simulation aérienne');
		await loader.load();
		expect(store.reads).toBe(1);

		store.files.set('config', { content: CACHE_CONFIG.replace('Pilote-Virtuel.com', 'PV'), version: 2 });
		expect((await loader.load()).boardTitle).toBe('PV - Forum de simulation aérienne');
		expect(dbReads()).toBe(0);
	});

	it('se rabat sur la base si le cache est absent ou illisible, avec une durée de vie courte', async () => {
		const { loader, store, dbValues, tick, dbReads } = setup();

		expect((await loader.load()).boardTitle).toBe('Titre en base');
		dbValues.set('o_board_title', 'Modifié');
		expect((await loader.load()).boardTitle).toBe('Titre en base');
		tick(10);
		expect((await loader.load()).boardTitle).toBe('Modifié');
		expect(dbReads()).toBe(2);

		store.files.set('config', { content: "$pun_config = array ('o_board_title' => 'tronq", version: 3 });
		tick(10);
		expect((await loader.load()).boardTitle).toBe('Modifié');
	});

	it('invalidate() vide le cache mémoire et supprime le fichier PHP', async () => {
		const { loader, store } = setup();
		store.files.set('config', { content: CACHE_CONFIG, version: 1 });
		await loader.load();

		await loader.invalidate();
		expect(store.files.has('config')).toBe(false);
		expect((await loader.load()).boardTitle).toBe('Titre en base');
	});
});

describe('UsersInfoLoader', () => {
	const CACHE =
		"<?php\n\ndefine('PUN_USERS_INFO_LOADED', 1);\n\n$stats = array (\n  'total_users' => '5',\n  'last_user' => \n  array (\n    'id' => '2',\n    'username' => 'admin',\n  ),\n);\n\n?>";

	it('lit cache_users_info.php comme index.php, sinon la base', async () => {
		const store = new FakeCacheStore();
		let dbReads = 0;
		const loader = new UsersInfoLoader(
			{
				loadUsersInfo: async () => {
					dbReads++;
					return { totalUsers: 9, newestUser: null };
				},
			},
			store,
			() => 1000,
		);

		expect(await loader.load()).toEqual({ totalUsers: 9, newestUser: null });
		store.files.set('users_info', { content: CACHE, version: 1 });
		expect(await loader.load()).toEqual({ totalUsers: 5, newestUser: { id: 2, username: 'admin' } });
		await loader.load();
		expect(store.reads).toBe(1);
		expect(dbReads).toBe(1);
	});
});
