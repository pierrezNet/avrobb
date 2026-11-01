/**
 * Outils de la base de test : une D1 locale (Miniflare, par getPlatformProxy de Wrangler) dans un
 * dossier temporaire, créée par globalSetup.ts avec les migrations et tests/db/seed.sql. La base
 * partagée par les fichiers de test est dans testDb.ts.
 */

import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';
import type { D1Database } from '../../src/db/d1.ts';
import { splitSqlStatements } from '../../src/db/sqlScript.ts';

/** Dossier de la base locale de test, partagé par globalSetup et les fichiers de test. */
export const TEST_D1_DIR = path.join(tmpdir(), 'avrobb-test-d1');
const ROOT = path.join(import.meta.dirname, '..', '..');

export async function openTestD1(): Promise<{ d1: D1Database; dispose: () => Promise<void> }> {
	const proxy = await getPlatformProxy<{ DB: D1Database }>({
		configPath: path.join(ROOT, 'wrangler.jsonc'),
		persist: { path: TEST_D1_DIR },
		envFiles: [],
		// Pas de liaison distante (Workers AI) : les tests n'en ont pas besoin, et la CI n'a pas de
		// session Cloudflare à ce stade (le démarrage échouait sur « Establishing remote connection »).
		remoteBindings: false,
	});
	return { d1: proxy.env.DB, dispose: () => proxy.dispose() };
}

/** Exécute un script SQL en un seul lot. */
export async function runSqlScript(d1: D1Database, script: string): Promise<void> {
	const statements = splitSqlStatements(script);
	if (statements.length > 0) await d1.batch(statements.map((statement) => d1.prepare(statement)));
}

export const seedScript = (): string => readFileSync(path.join(import.meta.dirname, 'seed.sql'), 'utf8');
