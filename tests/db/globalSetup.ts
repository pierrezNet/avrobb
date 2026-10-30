/**
 * Recrée la base de test avant les tests d'intégration : D1 locale neuve (dossier temporaire),
 * migrations de migrations/ dans l'ordre, puis jeu de données fixe (seed.sql).
 */

import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { openTestD1, runSqlScript, seedScript, TEST_D1_DIR } from './testDatabase.ts';

export default async function setup(): Promise<void> {
	await rm(TEST_D1_DIR, { recursive: true, force: true });
	const { d1, dispose } = await openTestD1();
	try {
		const dir = path.join(import.meta.dirname, '..', '..', 'migrations');
		for (const file of (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort())
			await runSqlScript(d1, await readFile(path.join(dir, file), 'utf8'));
		await runSqlScript(d1, seedScript());
	} finally {
		await dispose();
	}
}
