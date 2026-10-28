/**
 * Préfixes de sujet de PV (« [MSFS] », « [Résolu] »…) : listes proposées (en dur dans post.php et
 * edit.php du PHP) et réécriture du sujet quand l'auteur ajoute ou retire des préfixes.
 */

export const SIMULATOR_PREFIXES = ['MSFS', 'FS-24', 'FSX', 'X-Plane', 'Flight', 'P3D', 'MULTI-SIMU'] as const;
export const OTHER_PREFIXES = ['Résolu', 'Réel', 'Video'] as const;

const ALL_PREFIXES: readonly string[] = [...SIMULATOR_PREFIXES, ...OTHER_PREFIXES];

/** Balise proposée correspondant à `name` (insensible à la casse), ou undefined si elle est inventée. */
export function knownTag(name: string): string | undefined {
	const key = name.trim().toLowerCase();
	return ALL_PREFIXES.find((prefix) => prefix.toLowerCase() === key);
}

/**
 * Balises entre crochets en tête du sujet : les balises proposées (sans doublon, dans l'ordre de
 * saisie), le reste du sujet, et s'il y avait au moins une balise. Les balises inventées
 * (« [BETA] ») sont écartées.
 */
export function splitPrefixes(subject: string): { prefixes: string[]; rest: string; hadTags: boolean } {
	const prefixes: string[] = [];
	let rest = subject.trimStart();
	let hadTags = false;
	for (let match = /^\[([^[\]]{1,20})\]\s*/.exec(rest); match !== null; match = /^\[([^[\]]{1,20})\]\s*/.exec(rest)) {
		hadTags = true;
		const known = knownTag(match[1] ?? '');
		if (known !== undefined && !prefixes.includes(known)) prefixes.push(known);
		rest = rest.slice(match[0].length);
	}
	return { prefixes, rest, hadTags };
}

/** Sujet avec ces balises, dans l'ordre des listes (simulateurs puis autres), séparées du titre par une espace. */
function withTags(rest: string, tags: readonly string[]): string {
	const chosen = ALL_PREFIXES.filter((prefix) => tags.includes(prefix));
	return chosen.length > 0 ? `${chosen.map((prefix) => `[${prefix}]`).join('')} ${rest}` : rest;
}

/** Sujet avec les balises choisies (page « Balises du sujet ») ; les balises inventées disparaissent. */
export function applyPrefixes(subject: string, selected: readonly string[]): string {
	return withTags(splitPrefixes(subject).rest, selected);
}

/**
 * Sujet saisi (post.php, edit.php) : balises inventées retirées, doublons supprimés, balises
 * proposées remises dans l'ordre des listes. Un sujet sans balise reste tel quel.
 */
export function normalizeSubjectTags(subject: string): string {
	const { prefixes, rest, hadTags } = splitPrefixes(subject);
	return hadTags ? withTags(rest, prefixes) : subject;
}
