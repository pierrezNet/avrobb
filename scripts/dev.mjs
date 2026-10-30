/**
 * Développement : précompile les gabarits et les recompile à chaque modification, pendant que tsx
 * relance le serveur (src/server.ts) quand le code ou les gabarits compilés changent.
 *
 * En JavaScript (et non TypeScript) : lancé par npm run dev, avant tsx.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const children = [
	spawn(process.execPath, [path.join(root, 'scripts/build-templates.mjs'), '--watch'], { stdio: 'inherit' }),
	spawn(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), 'watch', '--env-file=.env', 'src/server.ts'], {
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
