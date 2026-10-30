/**
 * Précompile les gabarits Nunjucks de src/views/ en un module ES (src/generated/templates.js) :
 * un Worker n'a ni système de fichiers ni `eval`, il charge ce module avec PrecompiledLoader
 * (src/http/views.ts). Le code produit par Nunjucks ne fait que définir des fonctions.
 *
 *   node scripts/build-templates.mjs            une fois
 *   node scripts/build-templates.mjs --watch    et à chaque modification d'un gabarit
 *
 * En JavaScript (et non TypeScript) : lancé avant tsc et avant les tests, sans tsx.
 */

import { mkdirSync, watch, writeFileSync } from 'node:fs';
import path from 'node:path';
import nunjucks from 'nunjucks';

const root = path.join(import.meta.dirname, '..');
const viewsDir = path.join(root, 'src/views');
const outDir = path.join(root, 'src/generated');

/** Module ES : un objet { nom du gabarit : { root, b_<bloc>… } }, comme window.nunjucksPrecompiled. */
function wrapper(templates) {
	const entries = templates.map(({ name, template }) => `\t${JSON.stringify(name)}: (function () {\n${template}\n})(),`);
	return `// Généré par scripts/build-templates.mjs depuis src/views/ : ne pas modifier.\n/* eslint-disable */\nexport default {\n${entries.join('\n')}\n};\n`;
}

const DECLARATION = `// Généré par scripts/build-templates.mjs : ne pas modifier.
/** Gabarits Nunjucks précompilés, par nom relatif à src/views/ (« partials/forms.njk »). */
declare const templates: Record<string, Record<string, unknown>>;
export default templates;
`;

function build() {
	const started = Date.now();
	const code = nunjucks.precompile(viewsDir, { include: [/\.njk$/], wrapper });
	mkdirSync(outDir, { recursive: true });
	writeFileSync(path.join(outDir, 'templates.js'), code);
	writeFileSync(path.join(outDir, 'templates.d.ts'), DECLARATION);
	const count = (code.match(/^\t"/gm) ?? []).length;
	console.log(`Gabarits précompilés : ${count} en ${Date.now() - started} ms`);
}

build();

if (process.argv.includes('--watch')) {
	let timer = null;
	watch(viewsDir, { recursive: true }, (_event, file) => {
		if (file === null || !file.endsWith('.njk')) return;
		clearTimeout(timer);
		timer = setTimeout(() => {
			try {
				build();
			} catch (error) {
				// Gabarit invalide en cours d'édition : on garde la version précédente et on attend la suivante.
				console.error(`Gabarits non précompilés : ${error.message}`);
			}
		}, 100);
	});
}
