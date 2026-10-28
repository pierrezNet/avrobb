/**
 * Balises en tête de sujet (« [MSFS] », « [Résolu] », « [BETA] »…) affichées en pastilles colorées,
 * sans crochets. Affichage seulement : le sujet enregistré garde ses crochets (le PHP l'affiche tel quel).
 */

import type { SubjectTag } from '../domain/models.ts';
import { knownTag } from './subjectPrefixes.ts';
import type { SubjectPart } from './topicLabels.ts';

export interface TagColors {
	background: string;
	foreground: string;
}

/** Segment de sujet prêt pour la vue : texte simple, texte stylé (PunBalise) ou pastille. */
export interface SubjectSegment {
	text: string;
	/** Style en ligne d'un texte stylé ; null sinon. */
	css: string | null;
	tag: TagColors | null;
}

/** Pastille d'une balise PunBalise dont la couleur n'est pas utilisable. */
const NEUTRAL = '#475569';

/** Couleurs de la pastille d'une balise proposée (fond réglé dans l'administration, texte lisible). */
export function tagColors(tag: SubjectTag): TagColors {
	return readableOn(tag.color);
}

/** Texte foncé ou clair selon la luminance du fond (couleur réglée par l'administrateur). */
export function readableOn(background: string): TagColors {
	const hex = background.length === 4 ? background.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') : background;
	const [r, g, b] = [1, 3, 5].map((i) => {
		const channel = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
		return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
	});
	const luminance = 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
	return { background: hex, foreground: luminance > 0.179 ? '#1a1a1a' : '#ffffff' };
}

const TAG = /^\s*\[([^[\]]{1,20})\]\s*/;

/**
 * Transforme les balises entre crochets en tête du sujet en pastilles. Une balise PunBalise déjà
 * stylée « [Nom] » devient une pastille de sa couleur. Les balises inventées (« [BETA] ») et les
 * doublons ne sont pas affichés, même dans les anciens sujets (le sujet enregistré n'est pas modifié).
 * Dès qu'un autre texte apparaît, le reste du sujet est laissé tel quel.
 */
export function subjectSegments(
	parts: readonly SubjectPart[],
	css: (part: SubjectPart) => string | null,
	tags: readonly SubjectTag[],
): SubjectSegment[] {
	const segments: SubjectSegment[] = [];
	const shown = new Set<string>();
	const pushTag = (name: string, colors: TagColors): void => {
		const key = name.toLowerCase();
		if (shown.has(key)) return;
		shown.add(key);
		segments.push({ text: name, css: null, tag: colors });
	};
	let leading = true;
	for (const part of parts) {
		if (!leading) {
			segments.push({ text: part.text, css: css(part), tag: null });
			continue;
		}
		if (part.style !== null) {
			const bracketed = /^\s*\[([^[\]]+)\]\s*$/.exec(part.text);
			const color = part.style.color;
			if (bracketed?.[1] !== undefined) {
				const name = bracketed[1].trim();
				pushTag(name, readableOn(color !== null && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(color) ? color : NEUTRAL));
			} else {
				leading = false;
				segments.push({ text: part.text, css: css(part), tag: null });
			}
			continue;
		}
		let text = part.text;
		for (let match = TAG.exec(text); match?.[1] !== undefined; match = TAG.exec(text)) {
			const known = knownTag(match[1], tags);
			if (known !== undefined) pushTag(known.name, tagColors(known));
			text = text.slice(match[0].length);
		}
		if (text.trim() !== '') {
			leading = false;
			segments.push({ text: segments.length > 0 ? text.trimStart() : text, css: null, tag: null });
		}
	}
	return segments;
}
