/**
 * Balises de sujet de PV : préfixe ajouté au sujet, comme dans viewtopic.php (mod PunBalise 2.5).
 */

import type { TopicLabel } from '../domain/models.ts';

/** « [Réglé] », « *Réglé* » ou « #Réglé# » selon balises.baltype. */
export function labelText(label: TopicLabel): string {
	if (label.style === 'stars') return `*${label.name}*`;
	if (label.style === 'hashes') return `#${label.name}#`;
	return `[${label.name}]`;
}

/**
 * Sujet précédé de ses balises. Le PHP les préfixe une à une dans l'ordre de position : la dernière
 * se retrouve donc en tête.
 */
export function labelledSubject(subject: string, labels: readonly TopicLabel[]): string {
	return labels.reduce((text, label) => `${labelText(label)} ${text}`, subject);
}

/** Mise en forme d'une balise (couleur, gras, italique, souligné), déjà validée. */
export interface LabelStyle {
	color: string | null;
	bold: boolean;
	italic: boolean;
	underline: boolean;
}

export interface SubjectPart {
	text: string;
	style: LabelStyle | null;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

function labelPattern(label: TopicLabel): RegExp {
	const name = escapeRegExp(label.name);
	if (label.style === 'stars') return new RegExp(`\\*${name}.*?\\*`);
	if (label.style === 'hashes') return new RegExp(`#${name}.*?#`);
	return new RegExp(`\\[${name}.*?\\]`);
}

/** Couleur utilisable dans un attribut style : #rgb, #rrggbb ou un nom de couleur ; sinon null. */
function safeColor(color: string): string | null {
	return /^(#[0-9a-f]{3}|#[0-9a-f]{6}|[a-z]{3,20})$/i.test(color.trim()) ? color.trim() : null;
}

/**
 * Découpe un sujet pour mettre ses balises en forme, comme balises.php dans viewforum : pour chaque
 * balise définie, sa première occurrence (« [Réglé…] », qu'elle ait été posée par un modérateur ou
 * tapée dans le sujet) reçoit le style de la balise. Le texte reste brut : la vue l'échappe.
 */
export function styleSubject(subject: string, definitions: readonly TopicLabel[]): SubjectPart[] {
	let parts: SubjectPart[] = [{ text: subject, style: null }];

	for (const label of definitions) {
		const pattern = labelPattern(label);
		const index = parts.findIndex((part) => part.style === null && pattern.test(part.text));
		const part = parts[index];
		if (part === undefined) continue;

		const match = pattern.exec(part.text);
		if (match === null) continue;

		const style: LabelStyle = { color: safeColor(label.color), bold: label.bold, italic: label.italic, underline: label.underline };
		const pieces: SubjectPart[] = [
			{ text: part.text.slice(0, match.index), style: null },
			{ text: match[0], style },
			{ text: part.text.slice(match.index + match[0].length), style: null },
		];
		parts = [...parts.slice(0, index), ...pieces.filter((piece) => piece.text !== ''), ...parts.slice(index + 1)];
	}

	return parts;
}

/** Style CSS en ligne d'une balise (valeurs validées par styleSubject()). */
export function labelCss(style: LabelStyle): string {
	return [
		style.color !== null ? `color: ${style.color}` : '',
		style.bold ? 'font-weight: bold' : '',
		style.italic ? 'font-style: italic' : '',
		style.underline ? 'text-decoration: underline' : '',
	]
		.filter((rule) => rule !== '')
		.join('; ');
}
