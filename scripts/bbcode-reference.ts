/**
 * Régénère les sorties de référence du vrai PHP de PV pour les cas de tests/bbcode :
 * - cases.json → reference.json : parse_message() / parse_signature() ;
 * - writing-cases.json → writing-reference.json : preparse_bbcode() et mots indexés (search_idx.php).
 *
 * À relancer après tout ajout de cas :
 *
 *   npm run bbcode:reference      (le conteneur pv_web doit tourner)
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const docker = (command: string, input?: string): string =>
	execFileSync('sg', ['docker', '-c', command], { input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });

docker(`docker cp ${path.join(root, 'scripts', 'bbcode-reference.php')} pv_web:/tmp/bbcode-reference.php`);

for (const [cases, reference] of [
	['cases.json', 'reference.json'],
	['writing-cases.json', 'writing-reference.json'],
]) {
	const dir = path.join(root, 'tests', 'bbcode');
	const output = docker(
		'docker exec -i pv_web php -d display_errors=stderr /tmp/bbcode-reference.php',
		readFileSync(path.join(dir, cases ?? ''), 'utf8'),
	);
	writeFileSync(path.join(dir, reference ?? ''), output);
	console.log(`${reference} : ${Object.keys(JSON.parse(output) as object).length} sorties de référence écrites`);
}
