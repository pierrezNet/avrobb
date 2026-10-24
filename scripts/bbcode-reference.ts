/**
 * Régénère tests/bbcode/reference.json : la sortie du vrai parseur PHP de PV (include/parser.php)
 * pour chaque cas de tests/bbcode/cases.json. À relancer après tout ajout de cas :
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
const output = docker(
	'docker exec -i pv_web php -d display_errors=stderr /tmp/bbcode-reference.php',
	readFileSync(path.join(root, 'tests', 'bbcode', 'cases.json'), 'utf8'),
);
writeFileSync(path.join(root, 'tests', 'bbcode', 'reference.json'), output);
console.log(`${Object.keys(JSON.parse(output) as object).length} sorties de référence écrites`);
