/**
 * Tests rapides (doublures en mémoire) : `npm test`. Les tests sur base réelle sont à part
 * (vitest.db.config.ts, `npm run test:db`) car ils demandent le conteneur MariaDB.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['tests/**/*.test.ts'],
		exclude: ['tests/db/**', 'node_modules/**'],
	},
});
