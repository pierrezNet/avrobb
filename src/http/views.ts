/**
 * Rendu des gabarits Nunjucks précompilés (scripts/build-templates.mjs) avec le runtime sans
 * compilateur : aucun accès au système de fichiers ni `eval`, comme l'exige un Worker.
 * Échappement automatique, et toute variable indéfinie est une erreur (throwOnUndefined).
 */

import slim from 'nunjucks/browser/nunjucks-slim.js';

/** Gabarits précompilés, par nom relatif à src/views/. */
export type PrecompiledTemplates = Record<string, Record<string, unknown>>;

export interface ViewRenderer {
	render(template: string, data: object): string;
}

/** Fonctions globales des gabarits : liens internes et ressources statiques versionnées. */
export interface ViewGlobals {
	url: (target: string) => string;
	asset: (file: string) => string;
}

export function createViews(templates: PrecompiledTemplates, globals: ViewGlobals): ViewRenderer {
	// Le type de PrecompiledLoader attend des gabarits compilés en chaînes : les nôtres sont déjà des objets.
	const loader = new slim.PrecompiledLoader(templates as never);
	const env = new slim.Environment(loader, { autoescape: true, throwOnUndefined: true });
	env.addGlobal('url', globals.url);
	env.addGlobal('asset', globals.asset);
	return { render: (template, data) => env.render(template, data) };
}
