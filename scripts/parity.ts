/**
 * Mesure de parité entre une page PHP et son équivalent Node : compare le titre, le texte utile
 * et les liens des deux rendus, en ignorant le balisage (qui diffère volontairement).
 *
 *   npm run parity -- 'viewtopic.php?id=4' [--php http://localhost:8080] [--node http://localhost:3000]
 *                     [--cookie nom=valeur] [--ignore regex]… [--strict]
 *
 * Le texte est comparé mot à mot (plus longue sous-séquence commune) : les écarts sont regroupés
 * en blocs, avec les derniers mots communs comme repère. Les liens sont comparés en ensembles,
 * après normalisation (base PHP retirée, &amp; décodé, jetons CSRF masqués).
 * Avec --strict, le code de sortie vaut 1 en cas d'écart (utilisable en CI).
 */

import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		php: { type: 'string', default: 'http://localhost:8080' },
		node: { type: 'string', default: 'http://localhost:3000' },
		cookie: { type: 'string' },
		ignore: { type: 'string', multiple: true, default: [] },
		strict: { type: 'boolean', default: false },
	},
});

const page = positionals[0];
if (page === undefined) {
	console.error("Usage : npm run parity -- 'viewtopic.php?id=4' [--cookie nom=valeur] [--ignore regex] [--strict]");
	process.exit(1);
}

const ENTITIES: Readonly<Record<string, string>> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	hellip: '…',
	raquo: '»',
	laquo: '«',
};

function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
		if (code.startsWith('#x') || code.startsWith('#X')) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
		if (code.startsWith('#')) return String.fromCodePoint(Number(code.slice(1)));
		return ENTITIES[code.toLowerCase()] ?? whole;
	});
}

const normalizeSpaces = (text: string): string => text.replace(/[\s ]+/g, ' ').trim();

/** Texte visible, une ligne par bloc. */
function visibleLines(html: string): string[] {
	const body = html
		.replace(/<head[\s\S]*?<\/head>/i, '')
		.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '')
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<(br|hr)\b[^>]*>/gi, '\n')
		.replace(
			/<\/?(p|div|li|dt|dd|dl|ul|ol|h[1-6]|tr|td|th|table|section|article|header|footer|nav|aside|main|blockquote|pre|form|label|option|summary|details)\b[^>]*>/gi,
			'\n',
		)
		.replace(/<[^>]+>/g, '');

	return decodeEntities(body)
		.split('\n')
		.map(normalizeSpaces)
		.filter((line) => line !== '');
}

function title(html: string): string {
	return normalizeSpaces(decodeEntities(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? ''));
}

function links(html: string, phpBase: string, nodeBase: string): string[] {
	return [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/gi)].map(([, href = '']) =>
		decodeEntities(href)
			.replace(phpBase.replace(/\/$/, ''), '')
			.replace(nodeBase.replace(/\/$/, ''), '')
			.replace(/^\/(?=[\w-]+\.php)/, '')
			.replace(/^\.\//, '')
			.replace(/csrf_token=[0-9a-f]+/, 'csrf_token=…'),
	);
}

interface Hunk {
	context: string[];
	php: string[];
	node: string[];
}

/** Diff mot à mot par plus longue sous-séquence commune ; renvoie les blocs d'écarts et la longueur commune. */
function diffWords(a: readonly string[], b: readonly string[]): { hunks: Hunk[]; common: number } {
	const n = a.length;
	const m = b.length;
	if (n * m > 40_000_000) throw new Error(`Pages trop longues pour le diff mot à mot (${n} × ${m} mots)`);

	// lengths[i * (m + 1) + j] = LCS de a[i..] et b[j..]
	const width = m + 1;
	const lengths = new Uint32Array((n + 1) * width);
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			lengths[i * width + j] =
				a[i] === b[j]
					? (lengths[(i + 1) * width + j + 1] ?? 0) + 1
					: Math.max(lengths[(i + 1) * width + j] ?? 0, lengths[i * width + j + 1] ?? 0);
		}
	}

	const hunks: Hunk[] = [];
	const context: string[] = [];
	let current: Hunk | null = null;
	let i = 0;
	let j = 0;

	const open = (): Hunk => {
		current ??= { context: context.slice(-6), php: [], node: [] };
		return current;
	};

	while (i < n || j < m) {
		if (i < n && j < m && a[i] === b[j]) {
			if (current !== null) hunks.push(current);
			current = null;
			context.push(a[i] ?? '');
			i++;
			j++;
		} else if (j >= m || (i < n && (lengths[(i + 1) * width + j] ?? 0) >= (lengths[i * width + j + 1] ?? 0))) {
			open().php.push(a[i++] ?? '');
		} else {
			open().node.push(b[j++] ?? '');
		}
	}
	if (current !== null) hunks.push(current);

	return { hunks, common: lengths[0] ?? 0 };
}

const words = (lines: readonly string[]): string[] =>
	lines
		.join(' ')
		.split(' ')
		.filter((word) => word !== '');

async function fetchPage(base: string): Promise<string> {
	const url = new URL(page ?? '', base.endsWith('/') ? base : `${base}/`);
	const res = await fetch(url, { headers: values.cookie !== undefined ? { cookie: values.cookie } : {}, redirect: 'manual' });
	if (res.status >= 300 && res.status < 400) console.log(`  ${url} : redirection ${res.status} vers ${res.headers.get('location')}`);
	return new TextDecoder('utf-8').decode(await res.arrayBuffer());
}

const ignored = values.ignore.map((pattern) => new RegExp(pattern));
const keep = (line: string): boolean => !ignored.some((pattern) => pattern.test(line));

const [phpHtml, nodeHtml] = await Promise.all([fetchPage(values.php), fetchPage(values.node)]);

const phpWords = words(visibleLines(phpHtml).filter(keep));
const nodeWords = words(visibleLines(nodeHtml).filter(keep));
const { hunks, common } = diffWords(phpWords, nodeWords);

const phpLinks = new Set(links(phpHtml, values.php, values.node).filter(keep));
const nodeLinks = new Set(links(nodeHtml, values.php, values.node).filter(keep));
const linksOnlyPhp = [...phpLinks].filter((link) => !nodeLinks.has(link));
const linksOnlyNode = [...nodeLinks].filter((link) => !phpLinks.has(link));

const sameTitle = title(phpHtml) === title(nodeHtml);
const score = Math.round((common / Math.max(phpWords.length, nodeWords.length, 1)) * 100);

console.log(`Parité de ${page}`);
console.log(`  Titre : ${sameTitle ? 'identique' : `différent\n    PHP  : ${title(phpHtml)}\n    Node : ${title(nodeHtml)}`}`);
console.log(`  Texte : ${common} mots communs sur ${phpWords.length} (PHP) / ${nodeWords.length} (Node), parité ${score} %`);

if (hunks.length > 0) {
	console.log(`\nÉcarts de texte (${hunks.length})`);
	for (const hunk of hunks) {
		console.log(`  après « …${hunk.context.join(' ')} »`);
		if (hunk.php.length > 0) console.log(`    − PHP  : ${hunk.php.join(' ')}`);
		if (hunk.node.length > 0) console.log(`    + Node : ${hunk.node.join(' ')}`);
	}
}

const print = (heading: string, items: readonly string[]): void => {
	if (items.length === 0) return;
	console.log(`\n${heading} (${items.length})`);
	for (const item of items) console.log(`  ${item}`);
};
print('Liens seulement côté PHP', linksOnlyPhp);
print('Liens seulement côté Node', linksOnlyNode);

if (values.strict && (!sameTitle || hunks.length + linksOnlyPhp.length + linksOnlyNode.length > 0)) process.exit(1);
