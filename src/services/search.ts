/**
 * Règles de la recherche (search.php et include/search_idx.php), sans accès à la base :
 * validation de la demande, découpage des mots-clés, combinaison and/or/not, tri des résultats.
 */

import type { SerializableValue } from './phpSerialize.ts';

/** PUN_SEARCH_MIN_WORD et PUN_SEARCH_MAX_WORD (include/common.php). */
export const SEARCH_MIN_WORD = 3;
export const SEARCH_MAX_WORD = 20;

/** Recherches rapides de l'en-tête et du profil. */
export type SearchAction =
	| 'show_new'
	| 'show_recent'
	| 'show_replies'
	| 'show_user_posts'
	| 'show_user_topics'
	| 'show_subscriptions'
	| 'show_unanswered';

export type ShowAs = 'topics' | 'posts';

/** 0 date, 1 auteur, 2 sujet, 3 forum, 4 dernier message (search.php). */
export type SortBy = 0 | 1 | 2 | 3 | 4;

export interface KeywordSearch {
	kind: 'search';
	/** Mots-clés en minuscules (vide si recherche par auteur seulement). */
	keywords: string;
	/** Auteur tel que saisi (affiché dans le fil d'Ariane) et motif LIKE en minuscules. */
	author: string;
	authorPattern: string;
	forums: number[];
	/** 0 messages et sujets, 1 messages seulement, -1 sujets seulement. */
	searchIn: 0 | 1 | -1;
	sortBy: SortBy;
	sortDir: 'ASC' | 'DESC';
	showAs: ShowAs;
}

export interface ActionSearch {
	kind: 'action';
	action: SearchAction;
	/** Membre concerné (show_user_*, show_subscriptions). */
	userId: number;
	/** Forum limité (show_new, show_recent avec fid). */
	forumId: number | null;
	/** Fenêtre de show_recent, en secondes. */
	interval: number;
}

export type SearchRequest = KeywordSearch | ActionSearch;

/** Erreurs de validation, chacune associée à un message de search.php. */
export type SearchError = 'badRequest' | 'noTerms' | 'noPermission' | 'notFound';

export interface SearchParams {
	action?: string;
	keywords?: string;
	author?: string;
	forums?: string | string[];
	forum?: string;
	search_in?: string;
	sort_by?: string;
	sort_dir?: string;
	show_as?: string;
	user_id?: string;
	fid?: string;
	value?: string;
}

const ACTIONS: readonly SearchAction[] = [
	'show_new',
	'show_recent',
	'show_replies',
	'show_user_posts',
	'show_user_topics',
	'show_subscriptions',
	'show_unanswered',
];

/** intval() de PHP : préfixe numérique, sinon 0. */
function intval(value: string | undefined): number {
	const n = Number.parseInt(value ?? '', 10);
	return Number.isSafeInteger(n) ? n : 0;
}

/** Longueur sans les jokers, en caractères Unicode (pun_strlen()). */
const lengthWithoutWildcards = (text: string): number => [...text.replace(/[*%]/g, '')].length;

/**
 * Validation des paramètres comme search.php. `viewer` donne l'identifiant (0 pour un invité) et
 * le statut de modérateur.
 */
export function parseSearchRequest(
	params: SearchParams,
	viewer: { id: number; isGuest: boolean; isAdmMod: boolean },
): SearchRequest | SearchError {
	// Anciens noms d'action conservés par FluxBB.
	const action = params.action === 'show_user' ? 'show_user_posts' : params.action === 'show_24h' ? 'show_recent' : params.action;

	if (action === 'search') {
		let keywords = (params.keywords ?? '').trim().toLowerCase();
		let author = (params.author ?? '').trim().toLowerCase();

		if (/^[*%]+$/.test(keywords) || lengthWithoutWildcards(keywords) < SEARCH_MIN_WORD) keywords = '';
		if (/^[*%]+$/.test(author) || lengthWithoutWildcards(author) < 2) author = '';
		if (keywords === '' && author === '') return 'noTerms';

		const forums = (Array.isArray(params.forums) ? params.forums : (params.forums ?? params.forum ?? '').split(','))
			.map((id) => intval(id))
			.filter((id) => id > 0);
		const searchIn = params.search_in === undefined || params.search_in === '0' ? 0 : params.search_in === '1' ? 1 : -1;
		const sortBy = intval(params.sort_by);

		return {
			kind: 'search',
			keywords,
			author: author !== '' ? (params.author ?? '').trim() : '',
			authorPattern: author.replaceAll('*', '%'),
			forums: [...new Set(forums)],
			searchIn,
			sortBy: sortBy >= 0 && sortBy <= 4 ? (sortBy as SortBy) : 0,
			sortDir: params.sort_dir === 'DESC' ? 'DESC' : 'ASC',
			showAs: params.show_as === 'topics' ? 'topics' : 'posts',
		};
	}

	const known = ACTIONS.find((candidate) => candidate === action);
	if (known === undefined) return 'badRequest';

	const userId = params.user_id !== undefined ? intval(params.user_id) : viewer.id;
	if (known === 'show_user_posts' || known === 'show_user_topics' || known === 'show_subscriptions') {
		if (userId < 2) return 'notFound';
		if (known === 'show_subscriptions' && !viewer.isAdmMod && userId !== viewer.id) return 'noPermission';
	}
	if ((known === 'show_replies' || known === 'show_subscriptions') && viewer.isGuest) return 'badRequest';
	if (known === 'show_new' && viewer.isGuest) return 'noPermission';

	return {
		kind: 'action',
		action: known,
		userId,
		forumId: params.fid !== undefined ? intval(params.fid) : null,
		interval: params.value !== undefined ? intval(params.value) : 86_400,
	};
}

/** Balises retirées avant le découpage (split_words()). */
const BBCODE_TAGS = /\[\/?(b|u|s|ins|del|em|i|h|colou?r|quote|code|img|url|email|list|topic|post|forum|user)(?:=[^\]]*)?\]/g;

/**
 * Balises FluxToolBar retirées aussi (cache_fluxtoolbar_tag_search.php, généré depuis toolbar_tags) :
 * ce sont celles que le parseur de PV connaît en plus de FluxBB.
 */
const TOOLBAR_TAGS = /\[\/?(acronym|q|sup|sub|left|right|center|justify|video)(?:=[^\]]*)?\]/g;

/** PUN_CJK_HANGUL_REGEX : mots chinois, japonais ou coréens, cherchables mais jamais indexés. */
const CJK_WORD =
	/^[\u{1100}-\u{11FF}\u{3130}-\u{318F}\u{AC00}-\u{D7AF}\u{3040}-\u{309F}\u{30A0}-\u{30FF}\u{31F0}-\u{31FF}\u{2E80}-\u{2EFF}\u{2F00}-\u{2FDF}\u{2FF0}-\u{2FFF}\u{3000}-\u{303F}\u{31C0}-\u{31EF}\u{3200}-\u{32FF}\u{3400}-\u{4DBF}\u{4E00}-\u{9FFF}\u{20000}-\u{2A6DF}]+$/u;

const isOperator = (word: string): boolean => word === 'and' || word === 'or' || word === 'not';

/** validate_search_word() : à l'indexation, ni opérateurs ni mots CJK. */
function isValidWord(word: string, index: boolean, stopwords: ReadonlySet<string>): boolean {
	if (isOperator(word)) return !index;
	if (stopwords.has(word)) return false;
	if (CJK_WORD.test(word)) return !index;
	const length = lengthWithoutWildcards(word);
	return length >= SEARCH_MIN_WORD && length <= SEARCH_MAX_WORD;
}

/**
 * split_words() : mots uniques, dans l'ordre, sans mots vides, de 3 à 20 caractères. En recherche
 * (`index` faux), les jokers % et * sont gardés et « and », « or », « not » servent d'opérateurs.
 */
export function splitWords(text: string, index: boolean, stopwords: ReadonlySet<string>): string[] {
	let cleaned = text.replace(BBCODE_TAGS, ' ').replace(TOOLBAR_TAGS, ' ');
	cleaned = ` ${cleaned} `.replace(/((?<=[^\p{L}\p{N}])['-]|['-](?=[^\p{L}\p{N}]))/gu, '').slice(1, -1);
	cleaned = cleaned.replace(index ? /(?!['-])[^\p{L}\p{N}]+/gu : /(?!['\-%*])[^\p{L}\p{N}]+/gu, ' ');
	cleaned = cleaned.replace(/(\s){2,}/gu, '$1');

	return [...new Set(cleaned.split(' '))].filter((word) => isValidWord(word, index, stopwords));
}

/** split_words($text, false) : mots-clés d'une recherche. */
export const splitSearchWords = (text: string, stopwords: ReadonlySet<string>): string[] => splitWords(text, false, stopwords);

export interface WordHit {
	postId: number;
	topicId: number;
	/** Valeur de la colonne de tri (date, nom, sujet, forum). */
	sortValue: string | number;
}

/**
 * Combine les résultats mot par mot comme search.php : le premier mot initialise, puis chaque mot
 * est ajouté (or), retiré (not) ou croisé (and, par défaut) selon le dernier opérateur rencontré,
 * qui reste valable pour les mots suivants.
 */
export async function combineKeywords(
	words: readonly string[],
	lookup: (word: string) => Promise<WordHit[]>,
): Promise<Map<number, WordHit>> {
	const results = new Map<number, WordHit>();
	let match: 'and' | 'or' | 'not' = 'and';
	let wordCount = 0;

	for (const word of words) {
		if (word === 'and' || word === 'or' || word === 'not') {
			match = word;
			continue;
		}

		const hits = await lookup(word);
		const found = new Set(hits.map((hit) => hit.postId));

		for (const hit of hits) {
			if (wordCount === 0 || match === 'or') results.set(hit.postId, hit);
			else if (match === 'not') results.delete(hit.postId);
		}

		if (match === 'and' && wordCount > 0) for (const postId of [...results.keys()]) if (!found.has(postId)) results.delete(postId);

		wordCount++;
	}

	return results;
}

/** array_multisort() de search.php : valeur de tri, puis identifiant de message croissant. */
export function sortHits(hits: Iterable<WordHit>, direction: 'ASC' | 'DESC'): WordHit[] {
	const sign = direction === 'DESC' ? -1 : 1;
	return [...hits].sort((a, b) => {
		const byValue =
			typeof a.sortValue === 'number' && typeof b.sortValue === 'number'
				? a.sortValue - b.sortValue
				: String(a.sortValue).localeCompare(String(b.sortValue));
		return byValue !== 0 ? byValue * sign : a.postId - b.postId;
	});
}

/** Identifiants affichés : sujets (uniques, dans l'ordre) ou messages. */
export function resultIds(hits: readonly { postId: number; topicId: number }[], showAs: ShowAs): number[] {
	return [...new Set(hits.map((hit) => (showAs === 'topics' ? hit.topicId : hit.postId)))];
}

/** Description d'une recherche, pour le fil d'Ariane et le lien « refaire la recherche ». */
export type SearchType =
	| { kind: 'keywords' | 'author' | 'both'; keywords: string; author: string; forums: number[]; searchIn: 0 | 1 | -1 }
	| { kind: 'action'; action: SearchAction; userId: number | null };

/** Résultat d'une recherche : identifiants triés et paramètres d'affichage. */
export interface SearchOutcome {
	ids: number[];
	showAs: ShowAs;
	sortBy: SortBy;
	sortDir: 'ASC' | 'DESC';
	type: SearchType;
}

const toSortBy = (value: unknown): SortBy => {
	const n = Number(value);
	return n >= 0 && n <= 4 && Number.isInteger(n) ? (n as SortBy) : 0;
};

const toSearchIn = (value: unknown): 0 | 1 | -1 => (Number(value) === 1 ? 1 : Number(value) === -1 ? -1 : 0);

/**
 * Lit search_cache.search_data, écrit par search.php : serialize(array('search_ids' => serialize($ids),
 * 'num_hits', 'sort_by', 'sort_dir', 'show_as', 'search_type')). Null si le format est inattendu.
 */
export function parseCachedSearch(data: string, unserialize: (text: string) => unknown): SearchOutcome | null {
	try {
		const outer = unserialize(data);
		if (!(outer instanceof Map)) return null;

		const rawIds = outer.get('search_ids');
		const ids = typeof rawIds === 'string' ? unserialize(rawIds) : null;
		const type = outer.get('search_type');
		if (!(ids instanceof Map) || !(type instanceof Map)) return null;

		const kind = type.get(0);
		const showAs: ShowAs = outer.get('show_as') === 'topics' ? 'topics' : 'posts';
		const forums = String(type.get(2) ?? '')
			.split(',')
			.map(Number)
			.filter((id) => Number.isInteger(id) && id > 0);
		let searchType: SearchType;

		if (kind === 'action') {
			const action = ACTIONS.find((candidate) => candidate === type.get(1));
			if (action === undefined) return null;
			const userId = Number(type.get(2));
			searchType = { kind: 'action', action, userId: Number.isInteger(userId) && userId > 0 ? userId : null };
		} else if (kind === 'both') {
			const terms = type.get(1);
			if (!(terms instanceof Map)) return null;
			searchType = {
				kind: 'both',
				keywords: String(terms.get(0) ?? ''),
				author: String(terms.get(1) ?? ''),
				forums,
				searchIn: toSearchIn(type.get(3)),
			};
		} else if (kind === 'keywords' || kind === 'author') {
			const term = String(type.get(1) ?? '');
			searchType = {
				kind,
				keywords: kind === 'keywords' ? term : '',
				author: kind === 'author' ? term : '',
				forums,
				searchIn: toSearchIn(type.get(3)),
			};
		} else return null;

		return {
			ids: [...ids.values()].map(Number).filter((id) => Number.isInteger(id) && id > 0),
			showAs,
			sortBy: toSortBy(outer.get('sort_by')),
			sortDir: outer.get('sort_dir') === 'DESC' ? 'DESC' : 'ASC',
			type: searchType,
		};
	} catch {
		return null;
	}
}

/**
 * search_cache.search_data au format de search.php : tableau sérialisé dont search_ids est
 * lui-même une chaîne sérialisée. Le PHP relit ainsi les recherches faites par Node.
 */
export function serializeSearch(outcome: SearchOutcome, serialize: (value: SerializableValue) => string): string {
	const type = outcome.type;
	let searchType: SerializableValue[];
	if (type.kind === 'action') searchType = type.userId !== null ? ['action', type.action, type.userId] : ['action', type.action];
	else {
		const forums = type.forums.join(',');
		if (type.kind === 'both') searchType = ['both', [type.keywords, type.author], forums, type.searchIn];
		else searchType = [type.kind, type.kind === 'keywords' ? type.keywords : type.author, forums, type.searchIn];
	}

	return serialize(
		new Map<string, SerializableValue>([
			['search_ids', serialize(outcome.ids)],
			['num_hits', outcome.ids.length],
			['sort_by', outcome.sortBy],
			['sort_dir', outcome.sortDir],
			['show_as', outcome.showAs],
			['search_type', searchType],
		]),
	);
}
