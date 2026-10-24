/**
 * Mots vides de la recherche : lang/<langue>/stopwords.txt de l'installation PHP, comme
 * generate_stopwords_cache(). Lus une fois au premier usage (ils ne changent qu'avec le code).
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export interface StopwordsReader {
	load(): Promise<ReadonlySet<string>>;
}

export class StopwordsLoader implements StopwordsReader {
	#words: Promise<ReadonlySet<string>> | null = null;

	/** @param legacyRoot racine de l'installation PHP ; vide = aucun mot vide */
	constructor(private readonly legacyRoot: string) {}

	load(): Promise<ReadonlySet<string>> {
		this.#words ??= this.#read();
		return this.#words;
	}

	async #read(): Promise<ReadonlySet<string>> {
		if (this.legacyRoot === '') return new Set();

		const langDir = path.join(this.legacyRoot, 'lang');
		const words = new Set<string>();

		for (const entry of await readdir(langDir, { withFileTypes: true })) {
			if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
			try {
				const content = await readFile(path.join(langDir, entry.name, 'stopwords.txt'), 'utf8');
				for (const line of content.split(/\r?\n/)) if (line.trim() !== '') words.add(line.trim());
			} catch {
				// Langue sans fichier de mots vides.
			}
		}

		return words;
	}
}
