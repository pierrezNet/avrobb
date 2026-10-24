/**
 * Modèle de vue de l'aide BBCode (help.php). Chaque exemple est rendu par le vrai parseur
 * (services/bbcode.ts) : l'aide montre donc exactement ce que produiront les messages.
 */

import type { BoardConfig } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { type BbcodeOptions, parseMessage } from '../services/bbcode.ts';
import { doSmilies, SMILIES } from '../services/smilies.ts';

export interface HelpExample {
	/** BBCode à saisir. */
	code: string;
	/** Rendu de parseMessage() (échappé par construction). */
	html: string;
}

export interface HelpSection {
	id: string;
	title: string;
	intro: string[];
	examples: HelpExample[];
	outro: string[];
}

export interface HelpPageView {
	sections: HelpSection[];
	smilies: { codes: string[]; html: string }[];
}

export function buildHelpPage(config: BoardConfig, lang: Lang): HelpPageView {
	const t = lang.help;
	const base = `${config.baseUrl}/`;
	const options: BbcodeOptions = {
		bbcode: true,
		imgTag: true,
		showImages: true,
		smilies: false,
		censor: null,
		baseUrl: config.baseUrl,
		indentSpaces: config.indentSpaces,
		labels: { wrote: lang.common.wrote, imageLink: lang.common.imageLink, spoiler: lang.common.spoiler, video: lang.common.video },
	};
	const ex = (code: string): HelpExample => ({ code, html: parseMessage(code, options) });
	const section = (id: string, title: string, intro: string[], codes: string[], outro: string[] = []): HelpSection => ({
		id,
		title,
		intro,
		examples: codes.map(ex),
		outro,
	});
	const list = (type: string): string => `[list${type}][*]${t.listText1}[/*][*]${t.listText2}[/*][*]${t.listText3}[/*][/list]`;

	// Une ligne par émoji, avec tous les codes qui le produisent (regroupement de help.php).
	const groups = new Map<string, string[]>();
	for (const smiley of SMILIES) groups.set(smiley.emoji, [...(groups.get(smiley.emoji) ?? []), smiley.code]);

	return {
		sections: [
			section('bbcode', t.bbcode, [t.bbcodeInfo1, t.bbcodeInfo2], []),
			section(
				'style',
				t.textStyle,
				[t.textStyleInfo],
				[
					`[b]${t.boldText}[/b]`,
					`[u]${t.underlinedText}[/u]`,
					`[i]${t.italicText}[/i]`,
					`[s]${t.strikeText}[/s]`,
					`[del]${t.deletedText}[/del]`,
					`[ins]${t.insertedText}[/ins]`,
					`[em]${t.emphasisedText}[/em]`,
					`[color=#FF0000]${t.redText}[/color]`,
					`[color=blue]${t.blueText}[/color]`,
					`[h]${t.headingText}[/h]`,
				],
			),
			section(
				'url',
				t.linksAndImages,
				[t.linksInfo],
				[
					`[url=${base}]${config.boardTitle}[/url]`,
					`[url]${base}[/url]`,
					`[url=/help.php]${t.thisHelpPage}[/url]`,
					'[email]myname@example.com[/email]',
					`[email=myname@example.com]${t.myEmailAddress}[/email]`,
					`[topic=1]${t.testTopic}[/topic]`,
					'[topic]1[/topic]',
					`[post=1]${t.testPost}[/post]`,
					'[post]1[/post]',
					`[forum=1]${t.testForum}[/forum]`,
					'[forum]1[/forum]',
					`[user=2]${t.testUser}[/user]`,
					'[user]2[/user]',
				],
			),
			section('img', t.linksAndImages, [t.imagesInfo], [`[img=${t.bbcodeTest}]${config.baseUrl}/img/test.png[/img]`]),
			section(
				'quotes',
				t.quotes,
				[t.quotesInfo],
				[`[quote=James]${t.quoteText}[/quote]`, `[quote]${t.quoteText}[/quote]`],
				[t.quotesInfo2, t.quoteNote],
			),
			section('code', t.code, [t.codeInfo], [`[code]${t.codeText}[/code]`]),
			section('lists', t.lists, [t.listInfo], [list(''), list('=1'), list('=a')]),
			section('nested', t.nestedTags, [t.nestedTagsInfo], [`[b][u]${t.boldUnderlined}[/u][/b]`]),
			section(
				'pv',
				t.pvTags,
				[t.pvTagsInfo],
				[
					'm[sup]2[/sup] H[sub]2[/sub]O',
					`[center]${t.centeredText}[/center]`,
					'[acronym=Air Traffic Control]ATC[/acronym]',
					`[spoiler]${t.hiddenText}[/spoiler]`,
				],
				[t.videoInfo],
			),
		],
		smilies: [...groups.values()].map((codes) => ({ codes, html: doSmilies(codes[0] ?? '') })),
	};
}
