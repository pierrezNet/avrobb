/**
 * Nettoyage du BBCode avant enregistrement d'un message ou d'une signature : portage de
 * preparse_bbcode(), strip_empty_bbcode(), preparse_tags(), preparse_list_tag(), do_clickable() et
 * extract_blocks() de include/parser.php (avec les balises FluxToolBar de PV).
 *
 * Le texte produit est celui que le PHP enregistrerait : balises en minuscules, imbrications
 * simples réparées, listes normalisées, liens « www. » balisés, balises vides retirées. La parité
 * est vérifiée contre le vrai PHP (`npm run bbcode:reference`, cas « preparse »).
 *
 * Fonctions pures. Les erreurs sont typées ; leur texte vient de src/lang (formatPreparseError()).
 */

import { phpEmpty, punTrim } from './phpString.ts';

export type PreparseError =
	| { kind: 'emptyAfterStrip' }
	| { kind: 'signatureBlockTags' }
	| { kind: 'signatureLayoutTags' }
	| { kind: 'emptyAttribute'; tag: string }
	| { kind: 'tagNotAllowed'; tag: string }
	| { kind: 'invalidNesting'; tag: string; parent: string }
	| { kind: 'invalidSelfNesting'; tag: string }
	| { kind: 'noOpeningTag'; tag: string }
	| { kind: 'noClosingTag'; tag: string };

export interface PreparseOptions {
	isSignature: boolean;
	/** o_quote_depth : au-delà, les citations imbriquées sont supprimées. */
	quoteDepth: number;
	/** o_make_links : liens « www. » et « ftp. » transformés en [url]. */
	makeLinks: boolean;
	/** g_post_links du groupe : sinon [url] est refusée. */
	allowLinks: boolean;
	/** o_indent_num_spaces : tabulations remplacées (seulement quand le texte contient [code], comme le PHP). */
	indentSpaces: number;
	/** o_base_url, pour les liens relatifs. */
	baseUrl: string;
}

export interface PreparseResult {
	text: string;
	errors: PreparseError[];
}

/** \s de PCRE sans le mode UCP : espaces ASCII seulement. */
const WS = '\\t\\n\\v\\f\\r ';
export const CODE_MARK = '\u0001';

/** extract_blocks(), à l'identique (y compris ses positions calculées par strpos()). */
export function extractBlocks(source: string, indentSpaces: number): { inside: string[]; text: string } {
	const start = '[code]';
	const end = '[/code]';
	const inside: string[] = [];
	let text = source;
	let counter = 0;
	let offset = 0;
	let startPos = -1;
	let endPos = -1;
	// strpos() renvoie false, que PHP compte pour 0 dans « $offset + 1 ».
	const strpos = (needle: string, from: number): number => (from > text.length ? -1 : text.indexOf(needle, from));

	for (const [match] of source.matchAll(/\[code\]|\[\/code\]/g)) {
		if (match === start) {
			if (counter === 0) startPos = strpos(start, 0);
			counter++;
		} else {
			counter--;
			if (counter === 0) endPos = strpos(end, offset + 1);
			offset = Math.max(strpos(end, offset + 1), 0);
		}

		if (startPos !== -1 && endPos !== -1) {
			inside.push(text.slice(startPos + start.length, endPos));
			text = text.slice(0, startPos) + CODE_MARK + text.slice(endPos + end.length);
			startPos = -1;
			endPos = -1;
			offset = 0;
		}
	}

	if (indentSpaces !== 8) text = text.replaceAll('\t', ' '.repeat(indentSpaces));
	return { inside, text };
}

const hasCode = (text: string): boolean => text.includes('[code]') && text.includes('[/code]');

/** Remet les blocs [code] à la place de leurs marqueurs. */
function restoreBlocks(text: string, inside: readonly string[]): string {
	return text
		.split(CODE_MARK)
		.map((part, i) => part + (inside[i] !== undefined ? `[code]${inside[i]}[/code]` : ''))
		.join('');
}

function replaceUntilStable(text: string, pattern: RegExp): string {
	let current = text;
	for (;;) {
		const next = current.replace(pattern, '');
		if (next === current) return current;
		current = next;
	}
}

const EMPTY_TAG = new RegExp(
	`\\[(b|u|s|ins|del|em|i|h|colou?r|quote|img|url|email|list|topic|post|forum|user|acronym|q|sup|sub|left|right|center|justify|video)(?:=[^\\]]*)?\\][${WS}]*\\[/\\1\\]`,
	'g',
);
const EMPTY_CODE = new RegExp(`\\[(code)\\][${WS}]*\\[/\\1\\]`, 'g');

/** strip_empty_bbcode() */
export function stripEmptyBbcode(source: string, indentSpaces: number): string {
	let text = source;
	let inside: string[] | null = null;
	if (hasCode(text)) ({ inside, text } = extractBlocks(text, indentSpaces));

	text = replaceUntilStable(text, EMPTY_TAG);
	if (inside !== null) text = restoreBlocks(text, inside);
	return replaceUntilStable(text, EMPTY_CODE);
}

// --- Listes (preparse_list_tag()) -------------------------------------------------------------

/**
 * Fin (après « [/list] ») de la liste ouverte juste avant `from`, ou -1 si elle n'est pas fermée.
 * Équivaut à l'expression régulière récursive $re_list du PHP, que JavaScript n'a pas.
 */
function findListEnd(text: string, from: number): number {
	const token = /\[list(?:=[1a*])?\]|\[\/list\]/gi;
	token.lastIndex = from;
	for (let match = token.exec(text); match !== null; match = token.exec(text)) {
		if (match[0].startsWith('[/')) return match.index + match[0].length;
		const inner = findListEnd(text, match.index + match[0].length);
		if (inner === -1) return -1;
		token.lastIndex = inner;
	}
	return -1;
}

/** preg_replace_callback($re_list, preparse_list_tag…) : chaque liste fermée de premier niveau. */
function tidyLists(text: string): string {
	const open = /\[list(?:=([1a*]))?\]/gi;
	let out = '';
	let cursor = 0;
	for (let match = open.exec(text); match !== null; match = open.exec(text)) {
		const contentStart = match.index + match[0].length;
		const end = findListEnd(text, contentStart);
		if (end === -1) continue;
		out += text.slice(cursor, match.index) + listTag(text.slice(contentStart, end - '[/list]'.length), match[1] ?? '');
		cursor = end;
		open.lastIndex = end;
	}
	return out + text.slice(cursor);
}

/** preparse_list_tag() : un élément [*]…[/*] par ligne ; "\0" protège les balises déjà traitées. */
function listTag(source: string, type: string): string {
	const kind = type.length === 1 ? type : '*';
	const content = source.includes('[list') ? tidyLists(source) : source;
	let items = '';
	for (const item of content.replaceAll('\\"', '"').split('[*]')) {
		const trimmed = punTrim(item);
		if (trimmed !== '') items += `[*\0]${trimmed.replaceAll('[/*]', '')}[/*\0]\n`;
	}
	return `[list=${kind}]\n${items}[/list]`;
}

// --- Liens automatiques (do_clickable()) ------------------------------------------------------

/**
 * handle_url_tag($url, $link, true) : [url=…] seulement si l'adresse complétée diffère du texte.
 * PV renvoie alors le texte nu (« return $link; //'[url]'.$link.'[/url]' ») ; `wrapPlain` rétablit
 * le [url]…[/url] de FluxBB, pour l'affichage (linkBareUrls()).
 */
function urlBbcode(rawUrl: string, baseUrl: string, wrapPlain = false): string {
	const url = punTrim(rawUrl);
	let fullUrl = url.replaceAll(' ', '%20').replace(/['`"]/g, '');
	if (url.startsWith('www.')) fullUrl = `http://${fullUrl}`;
	else if (url.startsWith('ftp.')) fullUrl = `ftp://${fullUrl}`;
	else if (url.startsWith('/')) fullUrl = baseUrl + fullUrl;
	else if (!/^[a-z0-9]{3,6}:\/\//.test(url)) fullUrl = `http://${fullUrl}`;
	if (fullUrl === rawUrl) return wrapPlain ? `[url]${rawUrl}[/url]` : rawUrl;
	return `[url=${fullUrl}]${rawUrl}[/url]`;
}

const PATH = `(?:/(?:[^${WS}\\[]*[^${WS}.,?!\\[;:-])?)?`;

/**
 * Les deux motifs de do_clickable(). PCRE y emploie des conditions « (?(3)\)) » (parenthèse fermante
 * exigée si une parenthèse ouvrante précède) ; on les déplie en 8 variantes essayées dans l'ordre
 * où PCRE revient en arrière.
 */
function clickablePattern(scheme: string, separator: string, host: string, skipTags = 'url|img'): RegExp {
	const variants: string[] = [];
	for (const lt of [true, false])
		for (const bracket of [true, false])
			for (const paren of [true, false])
				variants.push(
					`${lt ? '<' : ''}${bracket ? '\\[' : ''}${paren ? '\\(' : ''}(?<q>['"]?)(?<url>${scheme}${separator}${host}(?::[0-9]+)?${PATH})\\k<q>` +
						`${paren ? '\\)' : ''}${bracket ? '\\]' : ''}${lt ? '>' : ''}`,
				);
	return new RegExp(`(?<=[${WS}\\]\\)])(?:${variants.join('|')})(?![^${WS}]*\\[/(?:${skipTags})\\])`, 'giu');
}

const CLICKABLE = [
	clickablePattern('(?:https?|ftp|news)', '://', '[\\p{L}\\p{N}\\-]+\\.(?:[\\p{L}\\p{N}\\-]+\\.)*[\\p{L}\\p{N}]+'),
	clickablePattern('(?:www|ftp)', '\\.', '(?:[\\p{L}\\p{N}\\-]+\\.)+[\\p{L}\\p{N}]+'),
];

/** Mêmes motifs pour l'affichage : on ne touche pas non plus aux adresses d'une [video]. */
const CLICKABLE_DISPLAY = [
	clickablePattern('(?:https?|ftp|news)', '://', '[\\p{L}\\p{N}\\-]+\\.(?:[\\p{L}\\p{N}\\-]+\\.)*[\\p{L}\\p{N}]+', 'url|img|video'),
	clickablePattern('(?:www|ftp)', '\\.', '(?:[\\p{L}\\p{N}\\-]+\\.)+[\\p{L}\\p{N}]+', 'url|img|video'),
];

function doClickable(text: string, baseUrl: string, patterns = CLICKABLE, wrapPlain = false): string {
	let out = ` ${text}`;
	for (const pattern of patterns)
		out = out.replace(pattern, (whole: string, ...args: unknown[]) => {
			const groups = args.at(-1) as { url?: string };
			const url = groups.url ?? '';
			return whole.replace(url, () => urlBbcode(url, baseUrl, wrapPlain));
		});
	return out.slice(1);
}

/**
 * Adresses laissées en texte brut (http://…, www.…) balisées en [url] avant l'affichage, hors
 * [code]. Écart assumé avec PV, qui ne transformait plus les adresses http en liens : les anciens
 * messages en profitent aussi, sans modifier la base.
 */
export function linkBareUrls(source: string, baseUrl: string): string {
	if (!hasCode(source)) return doClickable(source, baseUrl, CLICKABLE_DISPLAY, true);
	const { inside, text } = extractBlocks(source, 8);
	return restoreBlocks(doClickable(text, baseUrl, CLICKABLE_DISPLAY, true), inside);
}

// --- Structure des balises (preparse_tags()) --------------------------------------------------

const TAGS = [
	'quote',
	'code',
	'b',
	'i',
	'u',
	's',
	'ins',
	'del',
	'em',
	'color',
	'colour',
	'url',
	'email',
	'img',
	'list',
	'*',
	'h',
	'topic',
	'post',
	'forum',
	'user',
	'acronym',
	'q',
	'sup',
	'sub',
	'left',
	'right',
	'center',
	'justify',
	'video',
];
const ALL_TAGS = new Set(TAGS);
const BLOCK_TAGS = new Set(['quote', 'code', 'list', 'h', '*', 'left', 'right', 'center', 'justify']);
const INLINE_TAGS = new Set([
	'b',
	'i',
	'u',
	's',
	'ins',
	'del',
	'em',
	'color',
	'colour',
	'h',
	'topic',
	'post',
	'forum',
	'user',
	'acronym',
	'q',
	'sup',
	'sub',
	'video',
]);
const TRIM_TAGS = new Set(['img', 'video']);
const UNQUOTE_TAGS = new Set(['url', 'email', 'img', 'topic', 'post', 'forum', 'user', 'video']);
const FIXABLE_TAGS = new Set([
	'quote',
	'b',
	'i',
	'u',
	's',
	'ins',
	'del',
	'em',
	'color',
	'colour',
	'url',
	'email',
	'h',
	'topic',
	'post',
	'forum',
	'user',
]);
const INLINE_FORMATTING = ['b', 'i', 'u', 's', 'ins', 'del', 'em', 'color', 'colour'];
const LIMIT_BBCODE: ReadonlyMap<string, ReadonlySet<string>> = new Map(
	Object.entries({
		'*': [
			...INLINE_FORMATTING,
			'url',
			'email',
			'list',
			'img',
			'code',
			'topic',
			'post',
			'forum',
			'user',
			'acronym',
			'q',
			'sup',
			'sub',
			'video',
		],
		list: ['*'],
		url: ['img', 'acronym', 'q', 'sup', 'sub'],
		email: ['img', 'acronym', 'q', 'sup', 'sub'],
		topic: ['img'],
		post: ['img'],
		forum: ['img'],
		user: ['img'],
		img: [],
		h: [...INLINE_FORMATTING, 'url', 'email', 'topic', 'post', 'forum', 'user'],
		video: [],
	}).map(([tag, allowed]) => [tag, new Set(allowed)]),
);
const SENTINEL = 'fluxbb-bbcode';

const openingTag = (tag: string, arg: string): string => (phpEmpty(arg) ? `[${tag}]` : `[${tag}=${arg}]`);

/** État de l'analyse : pile des balises ouvertes et contexte courant, comme les variables du PHP. */
interface TagState {
	openTags: string[];
	openArgs: string[];
	opened: number;
	limit: ReadonlySet<string>;
	ignore: string;
	ignoreCount: number;
	nest: string;
	depth: Map<string, number>;
	nested: ReadonlyMap<string, number>;
}

const top = (state: TagState): string => state.openTags[state.opened] ?? '';

/**
 * Texte hors balise dans une balise en ligne : chaque double saut de ligne ferme les balises en
 * ligne ouvertes puis les rouvre après le saut.
 */
function splitInlineParagraphs(current: string, state: TagState): string {
	const parts = current.split(/(\n\n+)/).filter((part) => part !== '');
	const first = punTrim(parts[0] ?? '', '\n');
	if (phpEmpty(first)) parts.unshift('');

	let out = '';
	let i = 1;
	for (; i < parts.length; i += 2) {
		const reopened: [string, string][] = [];
		let closing = parts[i - 1] ?? '';
		while (state.openTags.length > 0) {
			const tag = state.openTags.pop() ?? '';
			const arg = state.openArgs.pop() ?? '';
			if (!INLINE_TAGS.has(tag)) {
				state.openTags.push(tag);
				state.openArgs.push(arg);
				break;
			}
			reopened.push([tag, arg]);
			closing += `[/${tag}]`;
		}
		out += closing + (parts[i] ?? '');
		while (reopened.length > 0) {
			const [tag, arg] = reopened.pop() ?? ['', ''];
			out += openingTag(tag, arg);
			state.openTags.push(tag);
			state.openArgs.push(arg);
		}
	}
	if (parts[i - 1] !== undefined) out += parts[i - 1];
	return out;
}

/** Fermeture d'une balise ouverte plus haut : referme puis rouvre celles qui la chevauchent. */
function fixNesting(current: string, tag: string, state: TagState): string | PreparseError {
	const reopened: [string, string][] = [];
	let closing = '';
	while (state.openTags.length > 0) {
		const openTag = state.openTags.pop() ?? '';
		const openArg = state.openArgs.pop() ?? '';
		if (!FIXABLE_TAGS.has(openTag)) return { kind: 'noClosingTag', tag: reopened.pop()?.[0] ?? '' };
		reopened.push([openTag, openArg]);
		if (openTag === tag) break;
		closing += `[/${openTag}]`;
	}
	reopened.pop();

	let reopening = '';
	while (reopened.length > 0) {
		const [openTag, openArg] = reopened.pop() ?? ['', ''];
		reopening += openingTag(openTag, openArg);
		state.openTags.push(openTag);
		state.openArgs.push(openArg);
	}
	state.opened--;
	return closing + current + reopening;
}

/** Balise fermante : la retire de la pile (en réparant l'imbrication si possible). */
function closeTag(current: string, tag: string, state: TagState): string | PreparseError {
	let out = current;
	if (state.opened === 0 || !state.openTags.includes(tag)) {
		// [/video] orpheline tolérée par PV.
		if (tag !== 'video') return { kind: 'noOpeningTag', tag };
	} else {
		for (;;) {
			const open = top(state);
			if (open === tag) {
				state.openTags.pop();
				state.openArgs.pop();
				state.opened--;
				break;
			}
			if (ALL_TAGS.has(open)) {
				if (!state.openTags.includes(tag)) return { kind: 'noOpeningTag', tag };
				const fixed = fixNesting(current, tag, state);
				if (typeof fixed !== 'string') return fixed;
				out = fixed;
				break;
			}
			state.openTags.pop();
			state.openArgs.pop();
			state.opened--;
		}
	}

	const depth = state.depth.get(tag);
	if (state.nested.has(tag) && depth !== undefined) state.depth.set(tag, depth - 1);
	state.limit = LIMIT_BBCODE.get(top(state)) ?? ALL_TAGS;
	return out;
}

/** Balise ouvrante ; null si elle est ignorée (citation trop profonde). */
function openTag(current: string, tag: string, arg: string, state: TagState): string | null | PreparseError {
	state.limit = LIMIT_BBCODE.get(tag) ?? ALL_TAGS;

	if (BLOCK_TAGS.has(tag) && !BLOCK_TAGS.has(top(state)) && state.opened !== 0) return { kind: 'invalidNesting', tag, parent: top(state) };

	if (tag === 'code') {
		state.ignore = tag;
		state.ignoreCount = 1;
		return current;
	}

	const maxDepth = state.nested.get(tag);
	if (maxDepth === undefined) {
		if (state.openTags.includes(tag)) return { kind: 'invalidSelfNesting', tag };
	} else {
		const depth = (state.depth.get(tag) ?? 0) + 1;
		state.depth.set(tag, depth);
		if (depth > maxDepth) {
			state.nest = tag;
			return null;
		}
	}

	let out = current;
	if (out.includes('=') && UNQUOTE_TAGS.has(tag)) out = out.replace(new RegExp(`\\[${tag}=("|'|)([^\\n]*?)\\1\\]`, 'i'), `[${tag}=$2]`);

	state.openTags.push(tag);
	state.openArgs.push(arg);
	state.opened++;
	return out;
}

/** Nom, argument et forme normalisée (nom en minuscules) d'une balise « [nom=arg] » ou « [/nom] ». */
function readTag(raw: string): { tag: string; arg: string } {
	if (raw.indexOf('/') === 1) return { tag: raw.slice(2, -1).toLowerCase(), arg: '' };
	const equal = raw.indexOf('=');
	if (equal === -1) return { tag: raw.slice(1, -1).toLowerCase(), arg: '' };
	return { tag: raw.slice(1, equal).toLowerCase(), arg: raw.slice(equal + 1, -1) };
}

/** preparse_tags() : texte corrigé, ou l'erreur qui empêche de l'enregistrer. */
export function preparseTags(text: string, options: Pick<PreparseOptions, 'allowLinks' | 'quoteDepth'>): string | PreparseError {
	const state: TagState = {
		openTags: [SENTINEL],
		openArgs: [''],
		opened: 0,
		limit: ALL_TAGS,
		ignore: '',
		ignoreCount: 0,
		nest: '',
		depth: new Map(),
		nested: new Map([
			['quote', options.quoteDepth],
			['list', 5],
			['*', 5],
		]),
	};
	let out = '';

	for (const piece of text.split(/(\[[*a-zA-Z0-9\-/]*?(?:=[^\n]*?)?\])/)) {
		if (piece === '') continue;

		if (!piece.startsWith('[') || !piece.endsWith(']')) {
			if (state.nest !== '') continue;
			let current = piece.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
			if (INLINE_TAGS.has(top(state)) && current.includes('\n')) current = splitInlineParagraphs(current, state);
			out += TRIM_TAGS.has(top(state)) ? punTrim(current) : current;
			continue;
		}

		const { tag, arg } = readTag(piece);
		if (!ALL_TAGS.has(tag)) {
			if (state.nest === '') out += piece;
			continue;
		}

		const equal = piece.indexOf('=');
		if (equal > 0 && piece.length - equal === 2) return { kind: 'emptyAttribute', tag };
		const current = equal > 0 ? piece.slice(0, equal).toLowerCase() + piece.slice(equal) : piece.toLowerCase();

		// Dans [code] : on ne compte que les [code] imbriqués, le reste est recopié tel quel.
		if (state.ignore !== '') {
			if (current === `[${state.ignore}]`) state.ignoreCount++;
			if (current === `[/${state.ignore}]`) {
				state.ignoreCount--;
				if (state.ignoreCount === 0) {
					state.ignore = '';
					state.ignoreCount = 0;
				}
			}
			out += current;
			continue;
		}

		if (tag === 'url' && !options.allowLinks) return { kind: 'tagNotAllowed', tag };

		const isClosing = current.charAt(1) === '/';

		// Citation trop profonde : tout est sauté jusqu'à sa fermeture.
		if (state.nest !== '') {
			if (tag !== state.nest) continue;
			const depth = (state.depth.get(tag) ?? 0) + (isClosing ? -1 : 1);
			state.depth.set(tag, depth);
			if (depth <= (state.nested.get(tag) ?? 0)) state.nest = '';
			continue;
		}

		if (!state.limit.has(tag) && tag !== top(state)) return { kind: 'invalidNesting', tag, parent: top(state) };

		const result = isClosing ? closeTag(current, tag, state) : openTag(current, tag, arg, state);
		if (result === null) continue;
		if (typeof result !== 'string') return result;
		out += result;
	}

	for (const tag of TAGS) if (state.openTags.includes(tag)) return { kind: 'noClosingTag', tag };
	if (state.ignore !== '') return { kind: 'noClosingTag', tag: state.ignore };
	return out;
}

// --- Ensemble (preparse_bbcode()) -------------------------------------------------------------

const SIGNATURE_BLOCK_TAGS = /\[\/?(?:quote|code|list|h)\b[^\]]*\]/i;
const SIGNATURE_LAYOUT_TAGS = /\[\/?(?:video|left|right|center|justify)\b[^\]]*\]/i;

/** Retire les balises vides jusqu'à stabilité ; null si le texte devient vide. */
function stripEmptyUntilStable(text: string, indentSpaces: number): string | null {
	let current = text;
	for (;;) {
		const next = stripEmptyBbcode(current, indentSpaces);
		if (next === current) return current;
		if (next === '') return null;
		current = next;
	}
}

/**
 * preparse_bbcode(). `hasPriorErrors` : le PHP partage le tableau d'erreurs du formulaire, et ne
 * vérifie la structure des balises (preparse_tags()) que s'il est encore vide.
 */
export function preparseBbcode(source: string, options: PreparseOptions, hasPriorErrors = false): PreparseResult {
	const errors: PreparseError[] = [];

	const stripped = stripEmptyUntilStable(source, options.indentSpaces);
	if (stripped === null) return { text: '', errors: [{ kind: 'emptyAfterStrip' }] };
	let text = stripped;

	if (options.isSignature) {
		if (SIGNATURE_BLOCK_TAGS.test(text)) errors.push({ kind: 'signatureBlockTags' });
		if (SIGNATURE_LAYOUT_TAGS.test(text)) errors.push({ kind: 'signatureLayoutTags' });
	}

	let inside: string[] | null = null;
	if (hasCode(text)) ({ inside, text } = extractBlocks(text, options.indentSpaces));

	text = tidyLists(text).replaceAll('*\0]', '*]');
	if (options.makeLinks) text = doClickable(text, options.baseUrl);

	if (errors.length === 0 && !hasPriorErrors) {
		const tidied = preparseTags(text, options);
		if (typeof tidied === 'string') text = tidied;
		else errors.push(tidied);
	}

	if (inside !== null) text = restoreBlocks(text, inside);

	const final = stripEmptyUntilStable(text, options.indentSpaces);
	if (final === null) {
		errors.push({ kind: 'emptyAfterStrip' });
		return { text: '', errors };
	}
	return { text: punTrim(final), errors };
}
