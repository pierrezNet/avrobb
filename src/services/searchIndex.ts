/**
 * Index de recherche d'un message (include/search_idx.php) : mots à indexer et différence avec
 * l'index existant. Fonctions pures ; les écritures (search_words, search_matches) sont faites
 * par SearchIndexRepository.
 */

import { splitWords } from './search.ts';

/** Mots indexés d'un message : dans son texte, et dans le sujet pour le premier message. */
export interface IndexedWords {
	post: string[];
	subject: string[];
}

/** strip_bbcode() : on indexe l'adresse et le texte des liens et images, pas les identifiants internes. */
export function stripIndexBbcode(text: string): string {
	return text
		.replace(/\[img=([^\]]*)\]([^[]*)\[\/img\]/g, '$2 $1')
		.replace(/\[(url|email)=([^\]]*)\]([^[]*(?:(?!\[\/\1\])\[[^[]*)*)\[\/\1\]/g, '$2 $3')
		.replace(/\[(img|url|email)\]([^[]*(?:(?!\[\/\1\])\[[^[]*)*)\[\/\1\]/g, '$2')
		.replace(/\[(topic|post|forum|user)\][1-9]\d*\[\/\1\]/g, ' ');
}

/** Début de update_search_index() : minuscules, balises retirées (message seulement), découpage. */
export function indexWords(message: string, subject: string | null, stopwords: ReadonlySet<string>): IndexedWords {
	return {
		post: splitWords(stripIndexBbcode(message.toLowerCase()), true, stopwords),
		subject: subject !== null && subject !== '' ? splitWords(subject.toLowerCase(), true, stopwords) : [],
	};
}

/** Index actuel d'un message : identifiant de chaque mot, selon qu'il vient du texte ou du sujet. */
export interface CurrentIndex {
	post: ReadonlyMap<string, number>;
	subject: ReadonlyMap<string, number>;
}

export interface IndexChanges {
	add: IndexedWords;
	/** Identifiants des mots dont la correspondance est à supprimer. */
	remove: { post: number[]; subject: number[] };
}

/** Partie « edit » de update_search_index() : ce qui change entre l'index actuel et les nouveaux mots. */
export function planIndexUpdate(words: IndexedWords, current: CurrentIndex): IndexChanges {
	const removed = (now: readonly string[], before: ReadonlyMap<string, number>): number[] => {
		const kept = new Set(now);
		return [...before].filter(([word]) => !kept.has(word)).map(([, id]) => id);
	};
	return {
		add: {
			post: words.post.filter((word) => !current.post.has(word)),
			subject: words.subject.filter((word) => !current.subject.has(word)),
		},
		remove: { post: removed(words.post, current.post), subject: removed(words.subject, current.subject) },
	};
}

/** Mots à créer dans search_words : ceux à ajouter qui n'y sont pas encore. */
export function newWords(changes: IndexChanges, known: ReadonlySet<string>): string[] {
	return [...new Set([...changes.add.post, ...changes.add.subject])].filter((word) => !known.has(word));
}
