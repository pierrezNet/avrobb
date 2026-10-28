/**
 * Balises en tête de sujet (« [MSFS] », « [Résolu] », « [BETA] »…) affichées en pastilles colorées,
 * sans crochets. Affichage seulement : le sujet enregistré garde ses crochets (le PHP l'affiche tel quel).
 */

import { knownTag, OTHER_PREFIXES, SIMULATOR_PREFIXES } from './subjectPrefixes.ts';
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

/** Couleurs des balises proposées (fond foncé, texte blanc : contraste ≥ 4,5:1). */
const KNOWN_COLORS: Readonly<Record<string, string>> = {
	msfs: '#1d4ed8',
	'fs-24': '#0f766e',
	fsx: '#6d28d9',
	'x-plane': '#9a3412',
	flight: '#be185d',
	p3d: '#4d7c0f',
	'multi-simu': '#475569',
	résolu: '#15803d',
	réel: '#a16207',
	video: '#b91c1c',
};

/** Couleurs des autres balises, choisies d'après le nom (toujours la même pour un nom donné). */
const PALETTE = ['#1e40af', '#155e75', '#5b21b6', '#86198f', '#9f1239', '#854d0e', '#166534', '#3f3f46'] as const;

/** Toutes les balises proposées ont une couleur propre. */
export const KNOWN_TAGS: readonly string[] = [...SIMULATOR_PREFIXES, ...OTHER_PREFIXES];

function hash(text: string): number {
	let value = 0;
	for (const char of text) value = (value * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
	return value;
}

/** Couleurs d'une balise d'après son nom. */
export function tagColors(name: string): TagColors {
	const key = name.trim().toLowerCase();
	const background = KNOWN_COLORS[key] ?? PALETTE[hash(key) % PALETTE.length] ?? PALETTE[0];
	return { background, foreground: '#ffffff' };
}

/** Texte foncé ou clair selon la luminance du fond (couleurs PunBalise réglées par l'administrateur). */
function readableOn(background: string): TagColors {
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
export function subjectSegments(parts: readonly SubjectPart[], css: (part: SubjectPart) => string | null): SubjectSegment[] {
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
				pushTag(name, color !== null && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(color) ? readableOn(color) : tagColors(name));
			} else {
				leading = false;
				segments.push({ text: part.text, css: css(part), tag: null });
			}
			continue;
		}
		let text = part.text;
		for (let match = TAG.exec(text); match?.[1] !== undefined; match = TAG.exec(text)) {
			const known = knownTag(match[1]);
			if (known !== undefined) pushTag(known, tagColors(known));
			text = text.slice(match[0].length);
		}
		if (text.trim() !== '') {
			leading = false;
			segments.push({ text: segments.length > 0 ? text.trimStart() : text, css: null, tag: null });
		}
	}
	return segments;
}
