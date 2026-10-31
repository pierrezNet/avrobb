/**
 * Liste des liens de pagination, comme paginate() de PV, mais sous forme de données :
 * la vue décide du balisage.
 */

export type PageLink =
	| { kind: 'page'; page: number; current: boolean }
	| { kind: 'gap' }
	| { kind: 'previous'; page: number }
	| { kind: 'next'; page: number };

/**
 * Éléments cochés au plus dans un formulaire (modération, messagerie, membres…). Une page en
 * affiche 75 au plus (disp_topics, disp_posts) : au-delà, la requête est forgée. Le plafond garde
 * chaque requête sous la limite de 100 paramètres de D1 (db/d1Dialect.ts), avec de la marge pour
 * les autres conditions.
 */
export const MAX_SELECTED_ITEMS = 80;

export function pageCount(items: number, perPage: number): number {
	return Math.max(1, Math.ceil(items / perPage));
}

/** Page demandée ramenée dans [1, numPages] (une valeur invalide donne 1, comme FluxBB). */
export function clampPage(requested: unknown, numPages: number): number {
	const page = Number.parseInt(String(requested ?? ''), 10);
	return Number.isNaN(page) || page < 1 || page > numPages ? 1 : page;
}

/**
 * paginate() de PV (réécrit par rapport à FluxBB) : page précédente, page 1 toujours, « … », pages
 * voisines (±1), « … », dernière page, page suivante.
 */
export function paginate(numPages: number, current: number): PageLink[] {
	if (numPages <= 1) return [{ kind: 'page', page: 1, current: true }];

	const links: PageLink[] = [];
	const page = (n: number): PageLink => ({ kind: 'page', page: n, current: n === current });

	if (current > 1) links.push({ kind: 'previous', page: current - 1 });

	links.push(page(1));
	if (current > 3 && numPages > 3) links.push({ kind: 'gap' });

	for (let n = Math.max(2, current - 1); n <= Math.min(numPages - 1, current + 1); n++) links.push(page(n));

	if (current < numPages - 2 && numPages > 3) links.push({ kind: 'gap' });
	links.push(page(numPages));

	if (current < numPages) links.push({ kind: 'next', page: current + 1 });

	return links;
}
