/**
 * Balises du sujet de PV (« [MSFS] », « [Résolu] »…) : repérage en tête du sujet et réécriture quand
 * l'auteur en ajoute ou en retire. La liste proposée vient de la configuration (BoardConfig.subjectTags).
 */

import type { SubjectTag } from '../domain/models.ts';

/** Balise proposée correspondant à `name` (insensible à la casse), ou undefined si elle est inventée. */
export function knownTag(name: string, tags: readonly SubjectTag[]): SubjectTag | undefined {
	const key = name.trim().toLowerCase();
	return tags.find((tag) => tag.name.toLowerCase() === key);
}

const LEADING_TAG = /^\[([^[\]]{1,20})\]\s*/;

/**
 * Balises entre crochets en tête du sujet : noms des balises proposées (sans doublon, dans l'ordre de
 * saisie), reste du sujet, et s'il y avait au moins une balise. Les balises inventées sont écartées.
 */
export function splitPrefixes(subject: string, tags: readonly SubjectTag[]): { prefixes: string[]; rest: string; hadTags: boolean } {
	const prefixes: string[] = [];
	let rest = subject.trimStart();
	let hadTags = false;
	for (let match = LEADING_TAG.exec(rest); match !== null; match = LEADING_TAG.exec(rest)) {
		hadTags = true;
		const known = knownTag(match[1] ?? '', tags);
		if (known !== undefined && !prefixes.includes(known.name)) prefixes.push(known.name);
		rest = rest.slice(match[0].length);
	}
	return { prefixes, rest, hadTags };
}

/**
 * Le sujet porte-t-il une balise de simulateur (MSFS, X-Plane…) ? Une nouvelle discussion sans
 * balise reçoit un avertissement avant publication (AvroBB), sans être refusée.
 */
export function hasSimulatorTag(subject: string, tags: readonly SubjectTag[]): boolean {
	const { prefixes } = splitPrefixes(subject, tags);
	return tags.some((tag) => tag.group === 'simulator' && prefixes.includes(tag.name));
}

/** Sujet avec ces balises, dans l'ordre de la liste, séparées du titre par une espace. */
function withTags(rest: string, names: readonly string[], tags: readonly SubjectTag[]): string {
	const chosen = tags.filter((tag) => names.includes(tag.name));
	return chosen.length > 0 ? `${chosen.map((tag) => `[${tag.name}]`).join('')} ${rest}` : rest;
}

/** Sujet avec les balises choisies (page « Balises du sujet ») ; les balises inventées disparaissent. */
export function applyPrefixes(subject: string, selected: readonly string[], tags: readonly SubjectTag[]): string {
	return withTags(splitPrefixes(subject, tags).rest, selected, tags);
}

/**
 * Sujet saisi (post.php, edit.php) : balises inventées retirées, doublons supprimés, balises
 * proposées remises dans l'ordre de la liste. Un sujet sans balise reste tel quel.
 */
export function normalizeSubjectTags(subject: string, tags: readonly SubjectTag[]): string {
	const { prefixes, rest, hadTags } = splitPrefixes(subject, tags);
	return hadTags ? withTags(rest, prefixes, tags) : subject;
}

/** Nouveau sujet après le renommage d'une balise (seulement si elle est en tête). */
export function renameTagInSubject(subject: string, from: string, to: string, tags: readonly SubjectTag[]): string {
	const { prefixes, rest, hadTags } = splitPrefixes(subject, [...tags, { name: from, group: 'other', color: '#000000' }]);
	if (!hadTags || !prefixes.includes(from)) return subject;
	return withTags(
		rest,
		prefixes.map((name) => (name === from ? to : name)),
		tags,
	);
}
