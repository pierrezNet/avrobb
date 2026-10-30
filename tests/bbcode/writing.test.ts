/**
 * Non-régression du pré-traitement BBCode (preparse_bbcode()) et des mots indexés (search_idx.php) :
 * chaque cas de writing-cases.json est comparé à writing-reference.json, sortie du PHP de FluxBB/PV
 * relevée une fois pour toutes (instantané figé : le PHP n'est plus disponible).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { preparseErrorText } from '../../src/lang/fr/post.ts';
import { bbcodeToEmail } from '../../src/services/bbcodeEmail.ts';
import { preparseBbcode } from '../../src/services/preparse.ts';
import { indexWords, newWords, planIndexUpdate } from '../../src/services/searchIndex.ts';

interface Case {
	name: string;
	fn: 'preparse' | 'index' | 'email';
	text: string;
	subject?: string;
	signature?: boolean;
	noLinks?: boolean;
}

const dir = import.meta.dirname;
const cases = JSON.parse(readFileSync(path.join(dir, 'writing-cases.json'), 'utf8')) as Case[];
const reference = JSON.parse(readFileSync(path.join(dir, 'writing-reference.json'), 'utf8')) as Record<string, unknown>;

/** Mots vides du PHP (cache_stopwords.php : lang/<langue>/stopwords.txt réunis). */
const stopwords = new Set(
	readFileSync(path.join(dir, 'stopwords.txt'), 'utf8')
		.split('\n')
		.map((word) => word.trim())
		.filter((word) => word !== ''),
);

const punLinebreaks = (text: string): string => text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');

describe('preparse_bbcode()', () => {
	for (const c of cases.filter((c) => c.fn === 'preparse')) {
		it(c.name, () => {
			const result = preparseBbcode(punLinebreaks(c.text), {
				isSignature: c.signature === true,
				quoteDepth: 3,
				makeLinks: true,
				allowLinks: c.noLinks !== true,
				indentSpaces: 4,
				baseUrl: 'http://forum.test',
			});
			expect({ text: result.text, errors: result.errors.map(preparseErrorText) }).toEqual(reference[c.name]);
		});
	}
});

describe('mots indexés (update_search_index())', () => {
	for (const c of cases.filter((c) => c.fn === 'index')) {
		it(c.name, () => {
			expect(indexWords(c.text, c.subject ?? null, stopwords)).toEqual(reference[c.name]);
		});
	}
});

describe('planIndexUpdate()', () => {
	it('ajoute les nouveaux mots et retire ceux qui ont disparu, séparément pour le sujet', () => {
		const changes = planIndexUpdate(
			{ post: ['avion', 'pilote', 'nuit'], subject: ['avion'] },
			{
				post: new Map([
					['avion', 1],
					['jour', 2],
				]),
				subject: new Map([['vol', 3]]),
			},
		);
		expect(changes).toEqual({
			add: { post: ['pilote', 'nuit'], subject: ['avion'] },
			remove: { post: [2], subject: [3] },
		});
		expect(newWords(changes, new Set(['nuit']))).toEqual(['pilote', 'avion']);
	});
});

describe('bbcode2email()', () => {
	for (const c of cases.filter((c) => c.fn === 'email')) {
		it(c.name, () => {
			expect(bbcodeToEmail(c.text, 'http://forum.test', 4)).toEqual(reference[c.name]);
		});
	}
});
