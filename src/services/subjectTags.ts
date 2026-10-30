/**
 * Balises en tête de sujet (« [AvroBB] », « [Résolu] », « [BETA] »…) affichées en pastilles colorées,
 * sans crochets. Affichage seulement : le sujet enregistré garde ses crochets (le PHP l'affiche tel quel).
 */

import type { SubjectTag } from '../domain/models.ts';
import { knownTag } from './subjectPrefixes.ts';

export interface TagColors {
	background: string;
	foreground: string;
}

/** Segment de sujet prêt pour la vue : texte simple ou pastille. */
export interface SubjectSegment {
	text: string;
	tag: TagColors | null;
}

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
 * Transforme les balises entre crochets en tête du sujet en pastilles. Les balises inventées
 * (« [BETA] ») et les doublons ne sont pas affichés, même dans les anciens sujets (le sujet
 * enregistré n'est pas modifié). Dès qu'un autre texte apparaît, le reste est laissé tel quel.
 */
export function subjectSegments(subject: string, tags: readonly SubjectTag[]): SubjectSegment[] {
	const segments: SubjectSegment[] = [];
	const shown = new Set<string>();
	let text = subject;
	for (let match = TAG.exec(text); match?.[1] !== undefined; match = TAG.exec(text)) {
		const known = knownTag(match[1], tags);
		if (known !== undefined && !shown.has(known.name.toLowerCase())) {
			shown.add(known.name.toLowerCase());
			segments.push({ text: known.name, tag: tagColors(known) });
		}
		text = text.slice(match[0].length);
	}
	if (text.trim() !== '') segments.push({ text: segments.length > 0 ? text.trimStart() : text, tag: null });
	return segments;
}
