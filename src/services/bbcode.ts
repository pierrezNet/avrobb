/**
 * Conversion BBCode → HTML des messages et signatures : portage de parse_message(), parse_signature(),
 * do_bbcode() et clean_paragraphs() de include/parser.php (avec les ajouts de PV : alignements,
 * acronym, q, sup, sub, video, spoiler).
 *
 * Sûr par construction : tout le texte est échappé AVANT de reconnaître les balises, et les seuls
 * attributs produits (href, src, alt, title, style color) viennent de ce texte échappé ou de motifs
 * stricts. Le résultat peut donc être marqué `| safe` dans les vues.
 *
 * Écarts assumés avec le PHP :
 * - citations, listes et spoilers ne sont convertis que s'ils sont équilibrés (le PHP produisait
 *   du HTML mal fermé sur un message mal formé) ;
 * - [topic], [post], [forum], [user] donnent un vrai lien (le PHP de PV produit « id=.$matches[1] ») ;
 * - [video] devient un lecteur intégré YouTube, Dailymotion ou Vimeo construit à partir d'un
 *   identifiant validé (le PHP produisait surtout des objets Flash) ; sinon un simple lien ;
 * - [spoiler] devient un <details> (sans JavaScript), [acronym] un <abbr>, et les alignements des
 *   classes CSS plutôt que des styles en ligne ;
 * - dans un message, chaque retour à la ligne simple est suivi d'un espace vertical
 *   (<span class="bbcode-gap">) : une ligne tapée avec Entrée se lit comme un petit paragraphe ;
 * - [img] accepte aussi une adresse relative vers les images du forum (/img/…, insérées par la
 *   galerie) ; une image envoyée sur le forum (WebP de img/gallery/) est servie dans un <picture>
 *   avec sa variante mobile pour les petits écrans ; toutes les images sont chargées à la demande
 *   (loading="lazy") ;
 * - une image de la galerie insérée avec son titre et sa description devient une carte (<figure>).
 */

import type { Censor } from './censor.ts';
import { MOBILE_BREAKPOINT, mobileVariantUrl } from './imageVariants.ts';
import { linkBareUrls } from './preparse.ts';
import { publicPath } from './routes.ts';
import { doSmilies } from './smilies.ts';

export interface BbcodeLabels {
	/** « Tessy a écrit : » ($lang_common['wrote']). */
	wrote: (author: string) => string;
	/** Texte d'une image non affichée : « <image - nom.png> » ($lang_common['Image link']). */
	imageLink: string;
	spoiler: string;
	video: string;
}

export interface BbcodeOptions {
	/** p_message_bbcode (ou p_sig_bbcode) : si faux, le texte est seulement échappé. */
	bbcode: boolean;
	/** p_message_img_tag (ou p_sig_img_tag) : balise [img] reconnue. */
	imgTag: boolean;
	/** Préférence du lecteur (show_img / show_img_sig) : image affichée, sinon simple lien. */
	showImages: boolean;
	/** o_smilies et show_smilies du lecteur, et pas hide_smilies sur le message. */
	smilies: boolean;
	/** Censure à appliquer (o_censoring), ou null. */
	censor: Censor | null;
	/** o_base_url : préfixe des liens relatifs commençant par « / ». */
	baseUrl: string;
	/** o_indent_num_spaces : remplacement des tabulations hors [code]. */
	indentSpaces: number;
	labels: BbcodeLabels;
	/** o_make_links : adresses en texte brut transformées en liens à l'affichage (messages). */
	makeLinks?: boolean;
}

/** pun_htmlspecialchars() : htmlspecialchars(ENT_QUOTES). */
export function escapeHtml(text: string): string {
	return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function decodeHtml(text: string): string {
	return text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#039;', "'").replaceAll('&amp;', '&');
}

/** Caractère de substitution des blocs [code] mis de côté (extract_blocks() utilise "\1"). */
const CODE_MARK = '\u0001';

/** extract_blocks() : blocs [code]…[/code] de premier niveau, remplacés par CODE_MARK. */
function extractCodeBlocks(text: string): { blocks: string[]; text: string } {
	const blocks: string[] = [];
	let out = '';
	let depth = 0;
	let start = 0;
	let cursor = 0;

	for (const match of text.matchAll(/\[code\]|\[\/code\]/g)) {
		const index = match.index;
		if (match[0] === '[code]') {
			if (depth === 0) start = index;
			depth++;
		} else if (depth > 0) {
			depth--;
			if (depth === 0) {
				out += text.slice(cursor, start) + CODE_MARK;
				blocks.push(text.slice(start + '[code]'.length, index));
				cursor = index + '[/code]'.length;
			}
		}
	}

	return { blocks, text: out + text.slice(cursor) };
}

/**
 * Applique `replace` aux occurrences de `pattern` (sans drapeau g) jusqu'à ce qu'il n'en reste plus.
 * Les motifs excluent une balise ouvrante dans leur contenu : la première occurrence est donc
 * toujours la plus interne, ce qui reproduit le traitement récursif du PHP.
 */
function replaceInnermost(text: string, pattern: RegExp, replace: (groups: readonly (string | undefined)[]) => string): string {
	let previous: string;
	let current = text;
	do {
		previous = current;
		// Arguments de replace() : correspondance, groupes…, position, chaîne complète.
		current = current.replace(pattern, (...args: unknown[]) => replace(args.slice(1, -2) as (string | undefined)[]));
	} while (current !== previous);
	return current;
}

/** handle_url_tag() : complète l'URL, et abrège le libellé à 55 caractères s'il reprend l'URL. */
function urlTag(rawUrl: string, rawLink: string, baseUrl: string): string {
	const url = rawUrl.trim();

	// [url][img]…[/img][/url] : l'image (déjà convertie) devient le libellé du lien vers sa source.
	const image = /<img src="([^"]*)"/.exec(url);
	if (image?.[1] !== undefined) return urlTag(image[1], url, baseUrl);

	let fullUrl = url.replaceAll(' ', '%20').replace(/['`"]/g, '');
	if (url.startsWith('www.')) fullUrl = `http://${fullUrl}`;
	else if (url.startsWith('ftp.')) fullUrl = `ftp://${fullUrl}`;
	else if (url.startsWith('/')) fullUrl = baseUrl + fullUrl;
	// Sans schéma « abcdef:// », on préfixe http:// : « javascript:… » devient donc inoffensif.
	else if (!/^[a-z0-9]{3,6}:\/\//.test(url)) fullUrl = `http://${fullUrl}`;
	// Lien vers une page du forum à son ancienne adresse (« …/viewtopic.php?id=4 ») : adresse publique.
	if (baseUrl !== '' && fullUrl.startsWith(`${baseUrl}/`) && /^[\w-]+\.php(?:[?#]|$)/.test(fullUrl.slice(baseUrl.length + 1)))
		fullUrl = baseUrl + publicPath(decodeHtml(fullUrl.slice(baseUrl.length + 1))).replaceAll('&', '&amp;');

	let link = rawLink;
	if (link === '' || link === url) {
		const decoded = [...decodeHtml(url)];
		link = escapeHtml(decoded.length > 55 ? `${decoded.slice(0, 39).join('')} … ${decoded.slice(-10).join('')}` : decoded.join(''));
	}

	return `<a href="${fullUrl}" rel="nofollow">${link}</a>`;
}

/** handle_img_tag() */
function imgTag(url: string, alt: string | null, isSignature: boolean, options: BbcodeOptions): string {
	const label = alt ?? url.slice(url.lastIndexOf('/') + 1);

	if (!options.showImages) return `<a href="${url}" rel="nofollow">&lt;${options.labels.imageLink} - ${label}&gt;</a>`;
	if (isSignature) return `<img class="sigimage" src="${url}" alt="${label}" loading="lazy" />`;
	// Image envoyée sur le forum (WebP converti) : variante mobile servie aux petits écrans.
	const mobile = mobileVariantUrl(url, options.baseUrl);
	if (mobile !== null)
		return `<span class="postimg"><picture><source media="(max-width: ${MOBILE_BREAKPOINT}px)" srcset="${mobile}" type="image/webp" /><img src="${url}" alt="${label}" loading="lazy" decoding="async" /></picture></span>`;
	return `<span class="postimg"><img src="${url}" alt="${label}" loading="lazy" /></span>`;
}

/** handle_list_tag() pour une liste sans liste imbriquée (les plus internes sont traitées d'abord). */
function listTag(type: string, content: string): string {
	const items = content.trim().replace(/\s*\[\*\]([\s\S]*?)\[\/\*\]\s*/g, '<li><p>$1</p></li>');
	if (type === 'a') return `</p><ol class="alpha">${items}</ol><p>`;
	if (type === '1') return `</p><ol class="decimal">${items}</ol><p>`;
	return `</p><ul>${items}</ul><p>`;
}

/** Lecteur intégré pour une URL de vidéo connue, construit uniquement à partir de l'identifiant. */
function videoTag(escapedUrl: string, options: BbcodeOptions): string {
	const url = decodeHtml(escapedUrl).trim();
	const players: [RegExp, (id: string) => string][] = [
		[
			/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/)|youtu\.be\/)([\w-]{6,20})/,
			(id) => `https://www.youtube-nocookie.com/embed/${id}`,
		],
		[/dailymotion\.com\/(?:embed\/)?video\/([a-zA-Z0-9]{4,20})/, (id) => `https://www.dailymotion.com/embed/video/${id}`],
		[/vimeo\.com\/(?:video\/)?(\d{3,12})/, (id) => `https://player.vimeo.com/video/${id}`],
	];

	for (const [pattern, embed] of players) {
		const id = pattern.exec(url)?.[1];
		if (id !== undefined)
			return `</p><div class="video"><iframe src="${embed(id)}" title="${options.labels.video}" loading="lazy" allow="fullscreen; picture-in-picture" allowfullscreen></iframe></div><p>`;
	}

	return urlTag(escapedUrl, '', options.baseUrl);
}

const SIMPLE_TAGS: readonly [RegExp, string][] = [
	[/\[b\](.*?)\[\/b\]/gs, '<strong>$1</strong>'],
	[/\[i\](.*?)\[\/i\]/gs, '<em>$1</em>'],
	[/\[u\](.*?)\[\/u\]/gs, '<span class="bbu">$1</span>'],
	[/\[s\](.*?)\[\/s\]/gs, '<span class="bbs">$1</span>'],
	[/\[del\](.*?)\[\/del\]/gs, '<del>$1</del>'],
	[/\[ins\](.*?)\[\/ins\]/gs, '<ins>$1</ins>'],
	[/\[em\](.*?)\[\/em\]/gs, '<em>$1</em>'],
	[/\[colou?r=([a-zA-Z]{3,20}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\](.*?)\[\/colou?r\]/gs, '<span style="color: $1">$2</span>'],
	[/\[h\](.*?)\[\/h\]/gs, '</p><h5>$1</h5><p>'],
	[/\[acronym\](.*?)\[\/acronym\]/gs, '<abbr>$1</abbr>'],
	[/\[acronym=(.*?)\](.*?)\[\/acronym\]/gs, '<abbr title="$1">$2</abbr>'],
	[/\[q\](.*?)\[\/q\]/gs, '<q>$1</q>'],
	[/\[sup\](.*?)\[\/sup\]/gs, '<sup>$1</sup>'],
	[/\[sub\](.*?)\[\/sub\]/gs, '<sub>$1</sub>'],
	[/\[left\](.*?)\[\/left\]/gs, '</p><p class="bbcode-left">$1</p><p>'],
	[/\[right\](.*?)\[\/right\]/gs, '</p><p class="bbcode-right">$1</p><p>'],
	[/\[center\](.*?)\[\/center\]/gs, '</p><p class="bbcode-center">$1</p><p>'],
	[/\[justify\](.*?)\[\/justify\]/gs, '</p><p class="bbcode-justify">$1</p><p>'],
	[/\[email\]([^[]*?)\[\/email\]/g, '<a href="mailto:$1">$1</a>'],
	[/\[email=([^[]+?)\](.*?)\[\/email\]/gs, '<a href="mailto:$1">$2</a>'],
];

/** Liens internes [topic], [post], [forum], [user] : adresses publiques (services/routes.ts), préfixées de o_base_url. */
const INTERNAL_LINKS: readonly [tag: string, url: (id: string) => string][] = [
	['topic', (id) => `viewtopic.php?id=${id}`],
	['post', (id) => `viewtopic.php?pid=${id}#p${id}`],
	['forum', (id) => `viewforum.php?id=${id}`],
	['user', (id) => `profile.php?id=${id}`],
];

const QUOTE_OPEN = /\[quote\]\s*/g;
const QUOTE_OPEN_AUTHOR = /\[quote=(&quot;|&#039;|"|'|)(.*?)\1\]/gs;
const QUOTE_CLOSE = /\s*\[\/quote\]/g;

/** Les [quote] ouvrants et fermants se répondent-ils dans l'ordre ? */
function quotesBalanced(text: string): boolean {
	let depth = 0;
	for (const [tag] of text.matchAll(/\[quote(?:=(?:&quot;|&#039;|"|'|)(?:.*?)\])?|\[quote\]|\[\/quote\]/gs)) {
		depth += tag === '[/quote]' ? -1 : 1;
		if (depth < 0) return false;
	}
	return depth === 0;
}

/** Citations de do_bbcode(), seulement si elles sont équilibrées (sinon laissées en texte). */
function doQuotes(text: string, labels: BbcodeLabels): string {
	if (!text.includes('[quote') || !quotesBalanced(text)) return text;

	return text
		.replace(QUOTE_OPEN, '</p><div class="quotebox"><blockquote><div><p>')
		.replace(
			QUOTE_OPEN_AUTHOR,
			(_w, _quote: string, author: string) =>
				`</p><div class="quotebox"><cite>${labels.wrote(author.replaceAll('[', '&#91;'))}</cite><blockquote><div><p>`,
		)
		.replace(QUOTE_CLOSE, '</p></div></blockquote></div><p>');
}

/** do_bbcode() */
function doBbcode(input: string, isSignature: boolean, options: BbcodeOptions): string {
	let text = input;

	text = doQuotes(text, options.labels);

	for (const [pattern, replacement] of SIMPLE_TAGS) text = text.replace(pattern, replacement);

	text = replaceInnermost(text, /\[spoiler\]((?:(?!\[spoiler\])[\s\S])*?)\[\/spoiler\]/i, ([inner = '']) => {
		return `</p><details class="spoiler"><summary>${options.labels.spoiler}</summary><p>${inner}</p></details><p>`;
	});

	text = text.replace(/\[video(?:=\d+,\d+| largeur=\d+ hauteur=\d+)?\]([^[<]*?)\[\/video\]/g, (_whole, url: string) =>
		videoTag(url, options),
	);

	if (!isSignature)
		text = replaceInnermost(
			text,
			/\[list(?:=([1a*]))?\]((?:(?!\[list(?:=[1a*])?\]|\[\/list\])[\s\S])*)\[\/list\]/,
			([type = '*', content = '']) => listTag(type, content),
		);

	if (options.imgTag) {
		// Schéma http(s)/ftp(s), ou fichier du forum (/img/… : même origine, jamais « //hôte »).
		text = text.replace(/\[img\]((?:ht|f)tps?:\/\/|\/img\/)([^\s<"]*?)\[\/img\]/g, (_w, scheme: string, rest: string) =>
			imgTag(scheme + rest, null, isSignature, options),
		);
		text = text.replace(
			/\[img=([^[]*?)\]((?:ht|f)tps?:\/\/|\/img\/)([^\s<"]*?)\[\/img\]/g,
			(_w, alt: string, scheme: string, rest: string) => imgTag(scheme + rest, alt, isSignature, options),
		);
	}

	text = text.replace(/\[url\]([^[]*?)\[\/url\]/g, (_w, url: string) => urlTag(url, '', options.baseUrl));
	text = text.replace(/\[url=([^[]+?)\](.*?)\[\/url\]/gs, (_w, url: string, label: string) => urlTag(url, label, options.baseUrl));

	for (const [tag, url] of INTERNAL_LINKS) {
		const href = (id: string): string => `${options.baseUrl}${publicPath(url(id))}`;
		text = text.replace(new RegExp(`\\[${tag}\\]([1-9]\\d*)\\[/${tag}\\]`, 'g'), (_w, id: string) => urlTag(href(id), '', options.baseUrl));
		text = text.replace(new RegExp(`\\[${tag}=([1-9]\\d*)\\](.*?)\\[/${tag}\\]`, 'gs'), (_w, id: string, label: string) =>
			urlTag(href(id), label, options.baseUrl),
		);
	}

	return text;
}

/** Retours à la ligne, tabulations et espaces multiples, comme parse_message(). */
function whitespace(text: string): string {
	return text.replaceAll('\n', '<br />').replaceAll('\t', '&#160; &#160; ').replaceAll('  ', '&#160; ').replaceAll('  ', ' &#160;');
}

/** clean_paragraphs() (sans le mod Video Player, dont les lecteurs Flash ne fonctionnent plus). */
function cleanParagraphs(input: string): string {
	let text = `<p>${input}</p>`;

	text = text.replace(/(<\/?p>)(?:\s*?<br \/>){1,2}/gi, '$1');
	text = text.replace(/(?:<br \/>\s*?){1,2}(<\/?p>)/gi, '$1');
	text = text.replaceAll('<p></p>', '');
	text = text.replace(/<br \/>\s*?<br \/>/gi, '</p><p>');
	text = text.replaceAll('<p><br />', '<br /><p>');
	text = text.replaceAll('<br /></p>', '</p><br />');
	text = text.replaceAll('<p></p>', '<br /><br />');

	return text;
}

function prepare(source: string, options: BbcodeOptions): string {
	// \1 sert de marqueur interne des blocs [code] (comme dans extract_blocks()).
	const text = source.replaceAll(CODE_MARK, '');
	return escapeHtml(options.censor !== null ? options.censor(text) : text);
}

/** parse_message() : corps d'un message. */
export function parseMessage(source: string, options: BbcodeOptions): string {
	const linked = options.bbcode && options.makeLinks === true ? linkBareUrls(source, options.baseUrl) : source;
	let text = prepare(linked, options);

	let blocks: string[] = [];
	if (text.includes('[code]') && text.includes('[/code]')) {
		const extracted = extractCodeBlocks(text);
		blocks = extracted.blocks;
		text = extracted.text;
	}
	if (options.indentSpaces !== 8) text = text.replaceAll('\t', ' '.repeat(options.indentSpaces));

	if (options.bbcode && text.includes('[') && text.includes(']')) text = doBbcode(text, false, options);
	if (options.smilies) text = doSmilies(text);

	text = whitespace(text);

	let index = 0;
	text = text.replaceAll(CODE_MARK, () => {
		const code = (blocks[index++] ?? '').replace(/^[\r\n]+|[\r\n]+$/g, '');
		const scroll = (code.match(/\n/g)?.length ?? 0) > 28 ? ' class="vscroll"' : '';
		return `</p><div class="codebox"><pre${scroll}><code>${code}</code></pre></div><p>`;
	});

	const html = spaceLineBreaks(cleanParagraphs(text));
	return options.showImages ? galleryCards(html, options.baseUrl) : html;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * Image de la galerie insérée dans un message ([b]titre[/b], [img]…[/img], description : code de
 * gallery.php?info=pick) mise en forme de carte : image, titre et légende dans un <figure>. Seul un
 * paragraphe qui ne contient que ce bloc est transformé ; le PHP l'affiche tel quel.
 */
function galleryCards(html: string, baseUrl: string): string {
	if (!html.includes('/img/gallery/')) return html;
	const gap = '<br /><span class="bbcode-gap"></span>';
	// Adresse relative (/img/gallery/…), ou absolue sous l'adresse du forum (anciens messages).
	const gallery = `${baseUrl !== '' ? `(?:${escapeRegExp(baseUrl)})?` : ''}${escapeRegExp('/img/gallery/')}`;
	const image = `<span class="postimg">(?:<picture>(?:(?!</picture>).)*</picture>|<img src="${gallery}[^"]*"[^>]*/>)</span>`;
	const pattern = new RegExp(
		`<p><strong>([^<]{1,80})</strong>${escapeRegExp(gap)}(${image})(?:${escapeRegExp(gap)}((?:(?!</p>).)*))?</p>`,
		'g',
	);
	return html.replace(pattern, (_whole, title: string, img: string, text: string | undefined) => {
		// Le titre décrit l'image mieux que son nom de fichier.
		const described = img.replace(/ alt="[^"]*"/, ` alt="${title}"`);
		const caption = text !== undefined && text !== '' ? `<span class="post-card__text">${text}</span>` : '';
		return `<figure class="post-card">${described}<figcaption><strong class="post-card__title">${title}</strong>${caption}</figcaption></figure>`;
	});
}

/**
 * Espace après un retour à la ligne simple (ni suivi d'un autre retour, ni en bordure de
 * paragraphe). Une marge sur <br> n'est pas prise en compte par les navigateurs, d'où l'élément vide.
 */
function spaceLineBreaks(html: string): string {
	return html.replace(/(?<!<br \/>)<br \/>(?!<br \/>|<\/?p>|<div)/g, '<br /><span class="bbcode-gap"></span>');
}

/** parse_signature() : pas de [code] ni de listes, images selon p_sig_img_tag. */
export function parseSignature(source: string, options: BbcodeOptions): string {
	let text = prepare(source, options);

	if (options.bbcode && text.includes('[') && text.includes(']')) text = doBbcode(text, true, options);
	if (options.smilies) text = doSmilies(text);

	return cleanParagraphs(whitespace(text));
}
