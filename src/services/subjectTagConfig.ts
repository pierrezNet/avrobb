/**
 * Balises du sujet enregistrées dans la table config (clé o_subject_tags, propre à AvroBB et ignorée
 * par le PHP) : lecture tolérante, liste par défaut, et écriture en JSON.
 */

import type { SubjectTag } from '../domain/models.ts';

export const SUBJECT_TAGS_KEY = 'o_subject_tags';

/**
 * Liste de départ, modifiable dans l'administration (page Balises) : les projets sont à compléter
 * avec ceux dont on discute sur le forum ; les autres balises décrivent l'état ou la nature du sujet.
 */
export const DEFAULT_SUBJECT_TAGS: readonly SubjectTag[] = [
	{ name: 'AvroBB', group: 'project', color: '#7a1d1d' },
	{ name: 'Question', group: 'other', color: '#1d4ed8' },
	{ name: 'Idée', group: 'other', color: '#6d28d9' },
	{ name: 'Bug', group: 'other', color: '#b91c1c' },
	{ name: 'Résolu', group: 'other', color: '#15803d' },
];

/** Nom de balise accepté : 1 à 20 caractères, sans crochets. */
export const isValidTagName = (name: string): boolean => /^[^[\]]{1,20}$/.test(name) && name.trim() === name;
export const isValidTagColor = (color: string): boolean => /^#[0-9a-f]{6}$/i.test(color);

/** Liste enregistrée ; les entrées invalides sont ignorées ; liste par défaut si la clé manque ou est illisible. */
export function parseSubjectTags(value: string | undefined): SubjectTag[] {
	if (value === undefined || value === '') return [...DEFAULT_SUBJECT_TAGS];
	let data: unknown;
	try {
		data = JSON.parse(value);
	} catch {
		return [...DEFAULT_SUBJECT_TAGS];
	}
	if (!Array.isArray(data)) return [...DEFAULT_SUBJECT_TAGS];
	const tags: SubjectTag[] = [];
	for (const item of data) {
		if (typeof item !== 'object' || item === null) continue;
		const { name, group, color } = item as Record<string, unknown>;
		if (typeof name !== 'string' || !isValidTagName(name) || typeof color !== 'string' || !isValidTagColor(color)) continue;
		if (tags.some((tag) => tag.name.toLowerCase() === name.toLowerCase())) continue;
		tags.push({ name, group: group === 'other' ? 'other' : 'project', color });
	}
	return tags;
}

/** Valeur à enregistrer : projets puis autres, dans l'ordre donné. */
export function serializeSubjectTags(tags: readonly SubjectTag[]): string {
	const ordered = [...tags.filter((tag) => tag.group === 'project'), ...tags.filter((tag) => tag.group === 'other')];
	return JSON.stringify(ordered.map(({ name, group, color }) => ({ name, group, color })));
}

export type SubjectTagError = 'name' | 'color' | 'duplicate';

/** Formulaire d'une balise du sujet ; `current` : nom de la balise modifiée (null pour un ajout). */
export function readSubjectTagForm(
	read: (name: string) => string,
	tags: readonly SubjectTag[],
	current: string | null,
): { kind: 'ok'; tag: SubjectTag } | { kind: 'error'; error: SubjectTagError } {
	const name = read('name').trim();
	const color = read('color').trim();
	if (!isValidTagName(name)) return { kind: 'error', error: 'name' };
	if (!isValidTagColor(color)) return { kind: 'error', error: 'color' };
	if (tags.some((tag) => tag.name.toLowerCase() === name.toLowerCase() && tag.name !== current))
		return { kind: 'error', error: 'duplicate' };
	return { kind: 'ok', tag: { name, group: read('group') === 'other' ? 'other' : 'project', color: color.toLowerCase() } };
}

/** Liste après l'ajout (en fin de groupe) ou la modification (à sa place) d'une balise. */
export function upsertSubjectTag(tags: readonly SubjectTag[], tag: SubjectTag, current: string | null): SubjectTag[] {
	if (current === null) return [...tags, tag];
	return tags.map((other) => (other.name === current ? tag : other));
}

/** Liste sans la balise `name`. */
export function removeSubjectTag(tags: readonly SubjectTag[], name: string): SubjectTag[] {
	return tags.filter((tag) => tag.name !== name);
}

/** Déplace une balise d'un cran dans son groupe (ordre d'affichage des boutons). */
export function moveSubjectTag(tags: readonly SubjectTag[], name: string, direction: -1 | 1): SubjectTag[] {
	const list = [...tags];
	const index = list.findIndex((tag) => tag.name === name);
	const tag = list[index];
	if (tag === undefined) return list;
	let target = index + direction;
	while (list[target] !== undefined && list[target]?.group !== tag.group) target += direction;
	const other = list[target];
	if (other === undefined) return list;
	list[index] = other;
	list[target] = tag;
	return list;
}
