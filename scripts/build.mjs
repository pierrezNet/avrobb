/**
 * Build de production sous Node : vide dist/, précompile les gabarits Nunjucks, compile src/ en
 * JavaScript (tsconfig.build.json) et copie les gabarits précompilés à côté (dist/generated, lu par
 * dist/app.js). public/ reste servi depuis la racine du projet. Lancement : npm run start.
 * Le Worker (lot 3) aura son propre build, par Wrangler.
 *
 * En JavaScript (et non TypeScript) : il doit tourner sans tsx, sur le serveur de production.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const node = (...args) => execFileSync(process.execPath, args, { stdio: 'inherit' });

rmSync(path.join(root, 'dist'), { recursive: true, force: true });
node(path.join(root, 'scripts/build-templates.mjs'));
node(path.join(root, 'node_modules/typescript/bin/tsc'), '-p', path.join(root, 'tsconfig.build.json'));
cpSync(path.join(root, 'src/generated'), path.join(root, 'dist/generated'), { recursive: true });
console.log('Build terminé : dist/');
