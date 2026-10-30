/**
 * URL des ressources statiques de public/assets/ (servies par Workers Static Assets sous /assets/),
 * suffixées d'une empreinte de leur contenu (`?v=…`) : le navigateur peut les garder longtemps en
 * cache et recharge dès qu'elles changent. Les empreintes viennent du manifeste calculé au build
 * (scripts/build.mjs → src/generated/assets.js) : rien n'est lu à l'exécution.
 */

/** Préfixe des ressources de public/assets/ (CSS, scripts, icônes). */
export const ASSETS_PREFIX = '/assets/';

export function createAssetUrl(manifest: Readonly<Record<string, string>>): (file: string) => string {
	return (file: string): string => {
		const hash = manifest[file];
		// Une ressource inconnue est une faute de frappe dans un gabarit : on la signale tout de suite.
		if (hash === undefined) throw new Error(`Ressource absente de public/assets/ : ${file}`);
		return `${ASSETS_PREFIX}${file}?v=${hash}`;
	};
}
