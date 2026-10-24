/**
 * Conversion BBCode → HTML pour l'affichage des messages et signatures.
 *
 * Sûr par construction : tout le texte est échappé AVANT de reconnaître les balises, et les seuls
 * attributs produits (href, src, style color) sont validés. Le résultat peut donc être marqué
 * `| safe` dans les vues, et c'est le seul HTML qui leur parvient tout fait.
 *
 * Sous-ensemble du parseur FluxBB (include/parser.php) : b, i, u, s, del, ins, em, h, color, url,
 * email, img, quote, code. Non repris pour le prototype : list, smilies (table vide chez PV),
 * censure, balises propres à PiloteVirtuel.
 */

export interface BbcodeOptions {
	/** p_message_bbcode : si faux, le texte est seulement échappé. */
	bbcode: boolean;
	/** [img] affiché comme image (sinon lien). */
	showImages: boolean;
}

export function escapeHtml(text: string): string {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}

/** URL déjà échappée HTML ; renvoie l'URL utilisable en attribut, ou null si le schéma est refusé. */
function safeUrl(escapedUrl: string): string | null {
	const url = escapedUrl.trim();

	if (/^(https?|ftps?):\/\//i.test(url))
		return url;
	if (/^www\./i.test(url))
		return `http://${url}`;
	if (/^(\/|\.\/|[\w-]+\.php)/i.test(url) && !url.includes(':'))
		return url;

	return null;
}

const COLOR = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|[a-z]{3,20})$/i;

/** Marqueurs des blocs [code] mis de côté pendant le traitement (le texte ne peut pas contenir \0). */
const CODE_TOKEN = /\u0000(\d+)\u0000/g;

function renderInline(text: string, options: BbcodeOptions): string {
	let html = text;

	const simple: [RegExp, string][] = [
		[/\[b\](.*?)\[\/b\]/gs, '<strong>$1</strong>'],
		[/\[i\](.*?)\[\/i\]/gs, '<em>$1</em>'],
		[/\[u\](.*?)\[\/u\]/gs, '<span class="bbu">$1</span>'],
		[/\[s\](.*?)\[\/s\]/gs, '<span class="bbs">$1</span>'],
		[/\[del\](.*?)\[\/del\]/gs, '<del>$1</del>'],
		[/\[ins\](.*?)\[\/ins\]/gs, '<ins>$1</ins>'],
		[/\[em\](.*?)\[\/em\]/gs, '<em>$1</em>'],
		[/\[h\](.*?)\[\/h\]/gs, '</p><h5>$1</h5><p>'],
	];

	for (const [pattern, replacement] of simple)
		html = html.replace(pattern, replacement);

	html = html.replace(/\[colou?r=([^\]]+)\](.*?)\[\/colou?r\]/gs, (whole, color: string, inner: string) =>
		COLOR.test(color) ? `<span style="color: ${color}">${inner}</span>` : whole);

	html = html.replace(/\[img\](.*?)\[\/img\]/gs, (whole, src: string) => {
		const url = safeUrl(src);
		if (url === null)
			return whole;
		return options.showImages
			? `<span class="postimg"><img src="${url}" alt="${url}" /></span>`
			: `<a href="${url}" rel="nofollow">${url}</a>`;
	});

	html = html.replace(/\[url\](.*?)\[\/url\]/gs, (whole, target: string) => {
		const url = safeUrl(target);
		return url === null ? whole : `<a href="${url}" rel="nofollow">${target}</a>`;
	});

	html = html.replace(/\[url=([^\]]+)\](.*?)\[\/url\]/gs, (whole, target: string, label: string) => {
		const url = safeUrl(target);
		return url === null ? whole : `<a href="${url}" rel="nofollow">${label}</a>`;
	});

	html = html.replace(/\[email\]([^\s@\[\]]+@[^\s@\[\]]+)\[\/email\]/g, '<a href="mailto:$1">$1</a>');
	html = html.replace(/\[email=([^\s@\[\]]+@[^\s@\[\]]+)\](.*?)\[\/email\]/gs, '<a href="mailto:$1">$2</a>');

	// Citations : on remplace d'abord les plus internes, jusqu'à ce qu'il n'en reste plus.
	const innermostQuote = /\[quote(?:=([^\]]*))?\]((?:(?!\[quote(?:=[^\]]*)?\]).)*?)\[\/quote\]/s;
	let previous: string;
	do {
		previous = html;
		html = html.replace(innermostQuote, (_whole, author: string | undefined, inner: string) => {
			const name = (author ?? '').replace(/^(&quot;|&#039;)(.*)\1$/, '$2').trim();
			const cite = name !== '' ? `<cite>${name} a écrit :</cite>` : '';
			return `</p><div class="quotebox">${cite}<blockquote><div><p>${inner}</p></div></blockquote></div><p>`;
		});
	} while (html !== previous);

	return html;
}

export function parseBbcode(source: string, options: BbcodeOptions): string {
	const codeBlocks: string[] = [];
	let text = source.replaceAll('\u0000', '').replaceAll('\r\n', '\n');

	if (options.bbcode) {
		text = text.replace(/\[code\]\n?(.*?)\[\/code\]/gs, (_whole, code: string) => {
			codeBlocks.push(code);
			return `\u0000${codeBlocks.length - 1}\u0000`;
		});
	}

	let html = escapeHtml(text);

	if (options.bbcode)
		html = renderInline(html, options);

	html = html.replaceAll('\n', '<br />').replaceAll('\t', '&#160; &#160; ');

	html = `<p>${html}</p>`;
	html = html.replace(/<br \/>\s*?<br \/>((\s*<br \/>)*)/g, '</p>$1<p>');
	html = html.replace(CODE_TOKEN, (_whole, index: string) =>
		`</p><div class="codebox"><pre><code>${escapeHtml(codeBlocks[Number(index)] ?? '')}</code></pre></div><p>`);
	html = html.replaceAll('<p><br />', '<p>').replace(/<p>\s*<\/p>/g, '');

	return html;
}
