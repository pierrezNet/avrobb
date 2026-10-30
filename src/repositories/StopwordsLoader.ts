/**
 * Mots vides de la recherche (lang/fr/stopwords.ts), derrière une interface pour que les tests
 * puissent en fournir d'autres. FTS5 les rendra inutiles au lot 3.
 */

import { stopwords } from '../lang/fr/stopwords.ts';

export interface StopwordsReader {
	load(): Promise<ReadonlySet<string>>;
}

export class BuiltinStopwords implements StopwordsReader {
	readonly #words: ReadonlySet<string> = new Set(stopwords);

	load(): Promise<ReadonlySet<string>> {
		return Promise.resolve(this.#words);
	}
}
