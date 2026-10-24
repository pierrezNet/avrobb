/**
 * Texte brut d'un message pour les e-mails de notification : portage de bbcode2email() de
 * include/email.php (sans retour à la ligne automatique : post.php l'appelle avec -1).
 * Les citations deviennent des lignes « > », les liens et images des renvois [n] listés à la fin.
 */

import { punTrim } from './phpString.ts';
import { CODE_MARK, extractBlocks } from './preparse.ts';

const SHORTCUT_URLS: Readonly<Record<string, string>> = {
	topic: '/viewtopic.php?id=$1',
	post: '/viewtopic.php?pid=$1#p$1',
	forum: '/viewforum.php?id=$1',
	user: '/profile.php?id=$1',
};

/** Balise la plus profonde (premier couple ouvrant/fermant sans même balise à l'intérieur). */
const INNER_TAG = /\[(quote|\*|url|img|email|topic|post|user|forum)(?:=([^\]]+))?\]([^[]*(?:(?!\[\/?\1(?:=[^\]]+)?\])\[[^[]*)*)\[\/\1\]/i;

/** empty() de PHP sur un groupe facultatif. */
const isEmpty = (value: string | undefined): boolean => value === undefined || value === '' || value === '0';

/** basename() de PHP sur une adresse. */
const basename = (url: string): string => {
	const trimmed = url.replace(/\/+$/, '');
	return trimmed.slice(trimmed.lastIndexOf('/') + 1);
};

/**
 * « > » devant chaque ligne citée (« >> » si elle l'était déjà). PCRE ne compte pas de ligne après
 * un saut de ligne final, contrairement au « ^ » multiligne de JavaScript.
 */
function quoteLines(text: string): string {
	const lines = text.split('\n');
	return lines
		.map((line, i) => (i > 0 && i === lines.length - 1 && line === '' ? line : line.startsWith('>') ? `>${line}` : `> ${line}`))
		.join('\n');
}

export function bbcodeToEmail(source: string, baseUrl: string, indentSpaces: number): string {
	const { inside: code, text: extracted } = extractBlocks(punTrim(source, '\t\n '), indentSpaces);

	let text = extracted
		.replace(/\[\/?(?!(?:quote|url|topic|post|user|forum|img|email|code|list|\*))[a-z]+(?:=[^\]]+)?\]/gi, '')
		.replace(/\n\[\/?list(?:=[^\]]+)?\]/gi, '');

	const urls: string[] = [];
	for (let match = INNER_TAG.exec(text); match !== null; match = INNER_TAG.exec(text)) {
		const [whole, rawTag = '', argument, content = ''] = match;
		const tag = rawTag.toLowerCase();
		let replacement: string;

		if (tag === 'quote') replacement = quoteLines(`${argument ?? ''} said:\n${content}`);
		else if (tag === '*') replacement = ` * ${content}`;
		else if (tag === 'url' || tag === 'email') {
			if (isEmpty(argument)) replacement = `[${content}]`;
			else {
				urls.push(argument ?? '');
				replacement = `[${content}][${urls.length}]`;
			}
		} else if (tag === 'img') {
			urls.push(content);
			replacement = `[${isEmpty(argument) ? basename(content) : argument}][${urls.length}]`;
		} else {
			const url = baseUrl + (SHORTCUT_URLS[tag] ?? '');
			if (isEmpty(argument)) replacement = `[${url.replaceAll('$1', content)}]`;
			else {
				urls.push(url.replaceAll('$1', argument ?? ''));
				replacement = `[${content}][${urls.length}]`;
			}
		}

		text = text.replaceAll(whole, replacement);
	}

	if (code.length > 0)
		text = text
			.split(CODE_MARK)
			.map((part, i) => part + (code[i] !== undefined ? punTrim(code[i] ?? '', '\n\r') : ''))
			.join('');

	if (urls.length > 0) text += `\n\n${urls.map((url, i) => `\n [${i + 1}]: ${url}`).join('')}`;
	return text;
}
