/**
 * Flux de syndication d'extern.php : output_rss(), output_xml() et output_html() (pas d'Atom dans AvroBB).
 * Fonctions pures produisant le document final ; les textes passent en CDATA (escape_cdata()) et les
 * URL en attribut échappé, comme le PHP.
 */

export interface FeedItem {
	id: number;
	title: string;
	link: string;
	/** HTML du message (parseMessage()). */
	description: string;
	author: { name: string; email: string | null; uri: string | null };
	/** Secondes Unix. */
	pubDate: number;
}

export interface Feed {
	title: string;
	link: string;
	description: string;
	/** posts : flux d'un sujet ; topics : flux de sujets (résumé). */
	type: 'posts' | 'topics';
	items: FeedItem[];
}

export interface FeedContext {
	/** URL de la requête, pour le lien « self ». */
	selfUrl: string;
	now: number;
}

const escapeAttr = (text: string): string =>
	text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

/** escape_cdata() : une section CDATA ne peut pas contenir « ]]> ». */
const cdata = (text: string): string => `<![CDATA[${text.replaceAll(']]>', ']]&gt;')}]]>`;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number): string => String(n).padStart(2, '0');

/** gmdate('r') : date RFC 2822 en UTC (« Thu, 21 Dec 2000 16:01:07 +0000 »). */
export function rfc2822(seconds: number): string {
	const d = new Date(seconds * 1000);
	return `${DAYS[d.getUTCDay()]}, ${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0000`;
}

/** gmdate('Y-m-d\TH:i:s\Z') */
export function iso8601(seconds: number): string {
	return new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

const lastUpdate = (feed: Feed, now: number): number => feed.items[0]?.pubDate ?? now;

export function renderRss(feed: Feed, context: FeedContext): string {
	const lines = [
		'<?xml version="1.0" encoding="utf-8"?>',
		'<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
		'\t<channel>',
		`\t\t<atom:link href="${escapeAttr(context.selfUrl)}" rel="self" type="application/rss+xml" />`,
		`\t\t<title>${cdata(feed.title)}</title>`,
		`\t\t<link>${escapeAttr(feed.link)}</link>`,
		`\t\t<description>${cdata(feed.description)}</description>`,
		`\t\t<lastBuildDate>${rfc2822(lastUpdate(feed, context.now))}</lastBuildDate>`,
		'\t\t<generator>AvroBB</generator>',
	];

	for (const item of feed.items) {
		lines.push(
			'\t\t<item>',
			`\t\t\t<title>${cdata(item.title)}</title>`,
			`\t\t\t<link>${escapeAttr(item.link)}</link>`,
			`\t\t\t<description>${cdata(item.description)}</description>`,
			`\t\t\t<author>${cdata(`${item.author.email ?? 'dummy@example.com'} (${item.author.name})`)}</author>`,
			`\t\t\t<pubDate>${rfc2822(item.pubDate)}</pubDate>`,
			`\t\t\t<guid>${escapeAttr(item.link)}</guid>`,
			'\t\t</item>',
		);
	}

	lines.push('\t</channel>', '</rss>');
	return `${lines.join('\n')}\n`;
}

function authorLines(author: FeedItem['author'], indent: string): string[] {
	return [
		`${indent}<name>${cdata(author.name)}</name>`,
		...(author.email !== null ? [`${indent}<email>${cdata(author.email)}</email>`] : []),
		...(author.uri !== null ? [`${indent}<uri>${escapeAttr(author.uri)}</uri>`] : []),
	];
}

export function renderXml(feed: Feed): string {
	const tag = feed.type === 'posts' ? 'post' : 'topic';
	const lines = ['<?xml version="1.0" encoding="utf-8"?>', '<source>', `\t<url>${escapeAttr(feed.link)}</url>`];

	for (const item of feed.items) {
		lines.push(
			`\t<${tag} id="${item.id}">`,
			`\t\t<title>${cdata(item.title)}</title>`,
			`\t\t<link>${escapeAttr(item.link)}</link>`,
			`\t\t<content>${cdata(item.description)}</content>`,
			'\t\t<author>',
			...authorLines(item.author, '\t\t\t'),
			'\t\t</author>',
			`\t\t<posted>${rfc2822(item.pubDate)}</posted>`,
			`\t</${tag}>`,
		);
	}

	lines.push('</source>');
	return `${lines.join('\n')}\n`;
}

/** FORUM_EXTERN_MAX_SUBJECT_LENGTH */
const MAX_SUBJECT = 30;

/** Liste de <li> pour inclusion dans une autre page (sujets tronqués à 30 caractères). */
export function renderHtmlList(feed: Feed): string {
	return feed.items
		.map((item) => {
			const chars = [...item.title];
			const label =
				chars.length > MAX_SUBJECT
					? `${escapeAttr(
							chars
								.slice(0, MAX_SUBJECT - 5)
								.join('')
								.trim(),
						)} …`
					: escapeAttr(item.title);
			return `<li><a href="${escapeAttr(item.link)}" title="${escapeAttr(item.title)}">${label}</a></li>\n`;
		})
		.join('');
}
