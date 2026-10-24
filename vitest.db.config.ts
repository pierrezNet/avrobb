/**
 * Tests d'intégration contre une vraie base MariaDB : `npm run test:db`.
 * La base de test (TEST_DB_NAME, pv_forum_test par défaut) est recréée à chaque lancement
 * à partir de tests/db/schema.sql et tests/db/seed.sql (voir tests/db/globalSetup.ts).
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['tests/db/**/*.test.ts'],
		globalSetup: ['tests/db/globalSetup.ts'],
		// Une seule base partagée : les fichiers ne doivent pas s'exécuter en parallèle.
		fileParallelism: false,
	},
});
