/**
 * Censure : censor_words() de include/functions.php, avec les motifs de generate_censoring_cache().
 * Un mot est remplacé s'il est isolé (ni lettre ni chiffre autour), sans tenir compte de la casse ;
 * « * » dans le mot censuré remplace n'importe quelle suite de lettres ou de chiffres.
 */

export interface CensoredWord {
	searchFor: string;
	replaceWith: string;
}

export type Censor = (text: string) => string;

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

export function buildCensor(words: readonly CensoredWord[]): Censor {
	const rules = words
		.filter((word) => word.searchFor !== '')
		.map((word) => ({
			pattern: new RegExp(
				`(?<=[^\\p{L}\\p{N}])(${escapeRegExp(word.searchFor).replaceAll('\\*', '[\\p{L}\\p{N}]*?')})(?=[^\\p{L}\\p{N}])`,
				'giu',
			),
			// En PHP, $1… dans le remplacement seraient interprétés : on reste en texte littéral.
			replacement: word.replaceWith.replaceAll('$', '$$$$'),
		}));

	if (rules.length === 0) return (text) => text;

	return (text) => {
		let result = ` ${text} `;
		for (const rule of rules) result = result.replace(rule.pattern, rule.replacement);
		return result.slice(1, -1);
	};
}
