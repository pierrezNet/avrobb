/**
 * Préfixes de sujet de PV (« [MSFS] », « [Résolu] »…) : listes proposées (en dur dans post.php et
 * edit.php du PHP) et réécriture du sujet quand l'auteur ajoute ou retire des préfixes.
 */

export const SIMULATOR_PREFIXES = ['MSFS', 'FS-24', 'FSX', 'X-Plane', 'Flight', 'P3D', 'MULTI-SIMU'] as const;
export const OTHER_PREFIXES = ['Résolu', 'Réel', 'Video'] as const;

const ALL_PREFIXES: readonly string[] = [...SIMULATOR_PREFIXES, ...OTHER_PREFIXES];

/** Préfixes connus en tête du sujet (insensibles à la casse, avec ou sans espaces) et reste du sujet. */
export function splitPrefixes(subject: string): { prefixes: string[]; rest: string } {
	const prefixes: string[] = [];
	let rest = subject.trimStart();
	for (;;) {
		const match = /^\[([^\]]{1,20})\]\s*/.exec(rest);
		const known =
			match !== null ? ALL_PREFIXES.find((prefix) => prefix.toLowerCase() === (match[1] ?? '').trim().toLowerCase()) : undefined;
		if (match === null || known === undefined) break;
		if (!prefixes.includes(known)) prefixes.push(known);
		rest = rest.slice(match[0].length);
	}
	return { prefixes, rest };
}

/**
 * Sujet avec les préfixes choisis, dans l'ordre des listes (simulateurs puis autres), séparés du
 * reste par une espace. Les préfixes inconnus restent dans le reste, intacts.
 */
export function applyPrefixes(subject: string, selected: readonly string[]): string {
	const { rest } = splitPrefixes(subject);
	const chosen = ALL_PREFIXES.filter((prefix) => selected.includes(prefix));
	return chosen.length > 0 ? `${chosen.map((prefix) => `[${prefix}]`).join('')} ${rest}` : rest;
}
