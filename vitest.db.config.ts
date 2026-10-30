/**
 * Tests d'intégration sur une vraie base D1 locale (Miniflare) : `npm run test:db`.
 * La base est recréée à chaque lancement à partir de migrations/ et de tests/db/seed.sql
 * (voir tests/db/globalSetup.ts).
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['tests/db/**/*.test.ts'],
		globalSetup: ['tests/db/globalSetup.ts'],
		// Une seule base partagée : les fichiers ne doivent pas s'exécuter en parallèle.
		fileParallelism: false,
		// Démarrage de Miniflare dans chaque fichier.
		hookTimeout: 30_000,
	},
});
