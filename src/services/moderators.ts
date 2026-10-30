/**
 * Modérateurs d'un forum (forums.moderators) : objet JSON { pseudo : identifiant }, à la place du
 * tableau sérialisé par PHP dans FluxBB. Une valeur illisible ou d'un autre format donne une liste vide.
 */

export function parseModerators(value: string | null): Map<string, number> {
	if (value === null || value === '') return new Map();
	let data: unknown;
	try {
		data = JSON.parse(value);
	} catch {
		return new Map();
	}
	if (typeof data !== 'object' || data === null || Array.isArray(data)) return new Map();
	const moderators = new Map<string, number>();
	for (const [username, id] of Object.entries(data)) if (Number.isInteger(id) && (id as number) > 0) moderators.set(username, id as number);
	return moderators;
}

/** Valeur à enregistrer ; null quand il n'y a plus aucun modérateur (comme FluxBB). */
export function serializeModerators(moderators: ReadonlyMap<string, number>): string | null {
	return moderators.size > 0 ? JSON.stringify(Object.fromEntries(moderators)) : null;
}
