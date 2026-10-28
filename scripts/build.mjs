/**
 * Build de production : vide dist/, compile src/ en JavaScript (tsconfig.build.json) et copie les
 * vues Nunjucks à côté (dist/views, lu par dist/app.js). public/ reste servi depuis la racine du
 * projet. Lancement ensuite : npm run start (node dist/server.js).
 *
 * En JavaScript (et non TypeScript) : il doit tourner sans tsx, sur le serveur de production.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
rmSync(path.join(root, 'dist'), { recursive: true, force: true });
execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', path.join(root, 'tsconfig.build.json')], {
	stdio: 'inherit',
});
cpSync(path.join(root, 'src/views'), path.join(root, 'dist/views'), { recursive: true });
console.log('Build terminé : dist/');
