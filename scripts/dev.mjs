/**
 * Développement : précompile les gabarits et le manifeste des ressources, les recalcule à chaque
 * modification (scripts/build.mjs --watch), et lance `wrangler dev` (Worker, D1 et R2 locaux, dans
 * .wrangler/state) qui recharge le Worker quand le code ou les fichiers générés changent.
 *
 * En JavaScript (et non TypeScript) : lancé par npm run dev, sans tsx.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const children = [
	spawn(process.execPath, [path.join(root, 'scripts/build.mjs'), '--watch'], { stdio: 'inherit' }),
	spawn(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'dev', ...process.argv.slice(2)], {
		cwd: root,
		stdio: 'inherit',
	}),
];

const stop = () => {
	for (const child of children) child.kill('SIGTERM');
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
for (const child of children)
	child.on('exit', (code) => {
		stop();
		process.exitCode = code ?? 0;
	});
