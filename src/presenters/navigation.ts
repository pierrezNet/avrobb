/**
 * Éléments de navigation réutilisés par toutes les pages : fil d'Ariane et liens de pagination,
 * avec leurs URL déjà calculées pour que les vues n'aient qu'à les afficher.
 */

import { paginate } from '../services/pagination.ts';

export interface Crumb {
	label: string;
	href: string;
	/** Dernier élément : la page courante (mis en gras, aria-current). */
	current: boolean;
}

/** Fil d'Ariane : le dernier élément est la page courante. */
export function crumbs(...items: readonly { label: string; href: string }[]): Crumb[] {
	return items.map((item, index) => ({ ...item, current: index === items.length - 1 }));
}

export type PaginationLink =
	| { kind: 'page'; page: number; href: string; current: boolean }
	| { kind: 'gap' }
	| { kind: 'previous' | 'next'; page: number; href: string };

/** paginate() de FluxBB, chaque lien portant son URL. */
export function paginationLinks(numPages: number, current: number, urlFor: (page: number) => string): PaginationLink[] {
	return paginate(numPages, current).map((link) => (link.kind === 'gap' ? link : { ...link, href: urlFor(link.page) }));
}
