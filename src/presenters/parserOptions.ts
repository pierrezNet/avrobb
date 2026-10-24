/**
 * Options de parse_message() pour un lecteur : réglages du forum (BBCode, [img], émoticônes),
 * préférences du lecteur et censure. Partagé par les pages qui affichent des messages.
 */

import type { BoardConfig, Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import type { BbcodeLabels, BbcodeOptions } from '../services/bbcode.ts';
import type { Censor } from '../services/censor.ts';

export function bbcodeLabels(lang: Lang): BbcodeLabels {
	return { wrote: lang.common.wrote, imageLink: lang.common.imageLink, spoiler: lang.common.spoiler, video: lang.common.video };
}

/** Options d'un message ; `hideSmilies` : case « ne pas convertir les émoticônes » du message. */
export function messageParserOptions(
	config: BoardConfig,
	viewer: Viewer,
	lang: Lang,
	censor: Censor | null,
	hideSmilies = false,
): BbcodeOptions {
	return {
		bbcode: config.bbcode,
		imgTag: config.imgTag,
		showImages: viewer.showImages,
		smilies: config.smilies && viewer.showSmilies && !hideSmilies,
		censor,
		baseUrl: config.baseUrl,
		indentSpaces: config.indentSpaces,
		labels: bbcodeLabels(lang),
	};
}
