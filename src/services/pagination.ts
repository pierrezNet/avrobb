/**
 * Liste des liens de pagination, comme paginate() de FluxBB, mais sous forme de données :
 * la vue décide du balisage.
 */

export type PageLink =
	| { kind: 'page'; page: number; current: boolean }
	| { kind: 'gap' }
	| { kind: 'previous'; page: number }
	| { kind: 'next'; page: number };

export function pageCount(items: number, perPage: number): number {
	return Math.max(1, Math.ceil(items / perPage));
}

/** Page demandée ramenée dans [1, numPages] (une valeur invalide donne 1, comme FluxBB). */
export function clampPage(requested: unknown, numPages: number): number {
	const page = Number.parseInt(String(requested ?? ''), 10);
	return Number.isNaN(page) || page < 1 || page > numPages ? 1 : page;
}

export function paginate(numPages: number, current: number): PageLink[] {
	const links: PageLink[] = [];

	if (numPages <= 1)
		return [{ kind: 'page', page: 1, current: true }];

	if (current > 1)
		links.push({ kind: 'previous', page: current - 1 });

	if (current > 3) {
		links.push({ kind: 'page', page: 1, current: false });
		if (current > 4)
			links.push({ kind: 'gap' });
	}

	for (let page = Math.max(1, current - 2); page <= Math.min(numPages, current + 2); page++)
		links.push({ kind: 'page', page, current: page === current });

	if (current < numPages - 2) {
		if (current < numPages - 3)
			links.push({ kind: 'gap' });
		links.push({ kind: 'page', page: numPages, current: false });
	}

	if (current < numPages)
		links.push({ kind: 'next', page: current + 1 });

	return links;
}
