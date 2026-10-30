/**
 * Build : précompile les gabarits Nunjucks de src/views/ (src/generated/templates.js) et calcule le
 * manifeste des empreintes des ressources de public/assets/ (src/generated/assets.js). Un Worker n'a
 * ni système de fichiers ni `eval` : il importe ces deux modules, et Wrangler les embarque.
 *
 *   node scripts/build.mjs            une fois (avant tsc, les tests et le déploiement)
 *   node scripts/build.mjs --watch    et à chaque modification d'un gabarit ou d'une ressource
 *
 * En JavaScript (et non TypeScript) : lancé sans tsx.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import path from 'node:path';
import nunjucks from 'nunjucks';

const root = path.join(import.meta.dirname, '..');
const viewsDir = path.join(root, 'src/views');
const assetsDir = path.join(root, 'public/assets');
const outDir = path.join(root, 'src/generated');

/** Écrit le fichier seulement s'il change : wrangler dev ne recharge pas le Worker pour rien. */
function writeIfChanged(file, content) {
	const target = path.join(outDir, file);
	let current = null;
	try {
		current = readFileSync(target, 'utf8');
	} catch {
		// Premier build.
	}
	if (current !== content) writeFileSync(target, content);
}

/** Module ES : un objet { nom du gabarit : { root, b_<bloc>… } }, comme window.nunjucksPrecompiled. */
function wrapper(templates) {
	const entries = templates.map(({ name, template }) => `\t${JSON.stringify(name)}: (function () {\n${template}\n})(),`);
	return `// Généré par scripts/build.mjs depuis src/views/ : ne pas modifier.\n/* eslint-disable */\nexport default {\n${entries.join('\n')}\n};\n`;
}

function buildTemplates() {
	const started = Date.now();
	const code = nunjucks.precompile(viewsDir, { include: [/\.njk$/], wrapper });
	writeIfChanged('templates.js', code);
	writeIfChanged(
		'templates.d.ts',
		`// Généré par scripts/build.mjs : ne pas modifier.
/** Gabarits Nunjucks précompilés, par nom relatif à src/views/ (« partials/forms.njk »). */
declare const templates: Record<string, Record<string, unknown>>;
export default templates;
`,
	);
	const count = (code.match(/^\t"/gm) ?? []).length;
	console.log(`Gabarits précompilés : ${count} en ${Date.now() - started} ms`);
}

/** Empreinte (10 caractères du SHA-1) de chaque fichier de public/assets/, par chemin relatif. */
function buildAssets() {
	const manifest = {};
	for (const entry of readdirSync(assetsDir, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile()) continue;
		const absolute = path.join(entry.parentPath, entry.name);
		const relative = path.relative(assetsDir, absolute).split(path.sep).join('/');
		manifest[relative] = createHash('sha1').update(readFileSync(absolute)).digest('hex').slice(0, 10);
	}
	const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
	writeIfChanged(
		'assets.js',
		`// Généré par scripts/build.mjs depuis public/assets/ : ne pas modifier.\nexport default ${JSON.stringify(sorted, null, '\t')};\n`,
	);
	writeIfChanged(
		'assets.d.ts',
		`// Généré par scripts/build.mjs : ne pas modifier.
/** Empreinte de chaque ressource de public/assets/, par chemin relatif (« css/base.css »). */
declare const assets: Record<string, string>;
export default assets;
`,
	);
}

mkdirSync(outDir, { recursive: true });
buildTemplates();
buildAssets();

if (process.argv.includes('--watch')) {
	/** Regroupe les modifications rapprochées ; une erreur (gabarit en cours d'édition) garde la version précédente. */
	const debounced = (task) => {
		let timer = null;
		return () => {
			clearTimeout(timer);
			timer = setTimeout(() => {
				try {
					task();
				} catch (error) {
					console.error(`Build incomplet : ${error.message}`);
				}
			}, 100);
		};
	};
	const templates = debounced(buildTemplates);
	const assets = debounced(buildAssets);
	watch(viewsDir, { recursive: true }, (_event, file) => {
		if (file?.endsWith('.njk')) templates();
	});
	watch(assetsDir, { recursive: true }, assets);
}
