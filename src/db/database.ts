/**
 * Connexion Kysely à la base MariaDB partagée avec le PHP, préfixe des tables compris.
 */

import { Kysely, MysqlDialect } from 'kysely';
import { createPool } from 'mysql2';
import type { AppConfig } from '../config.ts';
import { type Database, TABLE_NAMES } from './schema.ts';
import { TablePrefixPlugin } from './TablePrefixPlugin.ts';

export type Db = Kysely<Database>;

export function createDatabase(config: AppConfig['db']): Db {
	const plugins = config.tablePrefix !== '' ? [new TablePrefixPlugin(config.tablePrefix, TABLE_NAMES)] : [];

	return new Kysely<Database>({
		dialect: new MysqlDialect({
			pool: createPool({
				host: config.host,
				port: config.port,
				user: config.user,
				password: config.password,
				database: config.database,
				charset: 'utf8mb4',
				connectionLimit: 10,
			}),
		}),
		plugins,
	});
}
