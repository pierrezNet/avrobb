/**
 * Paramètres de la base de test, lus dans l'environnement (valeurs par défaut : conteneur pv_db
 * de PiloteVirtuel). Jamais la base de développement : le nom doit se terminer par « _test ».
 */

import type { AppConfig } from '../../src/config.ts';

export function testDbConfig(env: NodeJS.ProcessEnv = process.env): AppConfig['db'] {
	const database = env.TEST_DB_NAME ?? 'pv_forum_test';
	if (!database.endsWith('_test')) throw new Error(`TEST_DB_NAME doit se terminer par _test (reçu : ${database})`);

	return {
		host: env.TEST_DB_HOST ?? '127.0.0.1',
		port: Number(env.TEST_DB_PORT ?? 3307),
		user: env.TEST_DB_USER ?? 'root',
		password: env.TEST_DB_PASSWORD ?? 'root',
		database,
		tablePrefix: 'fo_',
	};
}
