/**
 * URL des ressources statiques de public/, suffixées d'une empreinte de leur contenu (`?v=…`) :
 * le navigateur peut les garder longtemps en cache et recharge dès qu'elles changent.
 *
 * Adaptateur Node : l'empreinte est calculée en lisant le fichier. Dans le Worker (lot 3), un
 * manifeste calculé au build la remplacera.
 */

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { ASSETS_PREFIX } from '../http/server.ts';

export function createAssetUrl(publicDir: string): (file: string) => string {
	const root = path.resolve(publicDir);
	const fingerprints = new Map<string, { mtimeMs: number; hash: string }>();

	return (file: string): string => {
		const absolute = path.resolve(root, file);
		if (!absolute.startsWith(root + path.sep)) throw new Error(`Ressource hors de public/ : ${file}`);

		// Un stat par appel : un fichier modifié pendant le développement change aussitôt d'empreinte.
		const { mtimeMs } = statSync(absolute);
		let entry = fingerprints.get(absolute);
		if (entry?.mtimeMs !== mtimeMs) {
			entry = { mtimeMs, hash: createHash('sha1').update(readFileSync(absolute)).digest('hex').slice(0, 10) };
			fingerprints.set(absolute, entry);
		}

		return `${ASSETS_PREFIX}${file}?v=${entry.hash}`;
	};
}
