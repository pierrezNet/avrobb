/**
 * Runtime Nunjucks sans compilateur (nunjucks/browser/nunjucks-slim.js) : mêmes classes que le
 * paquet complet pour l'environnement et le chargeur de gabarits précompilés.
 */

declare module 'nunjucks/browser/nunjucks-slim.js' {
	import type { Environment, PrecompiledLoader } from 'nunjucks';

	const slim: {
		Environment: typeof Environment;
		PrecompiledLoader: typeof PrecompiledLoader;
	};
	export default slim;
}
