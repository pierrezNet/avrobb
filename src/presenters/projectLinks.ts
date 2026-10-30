/**
 * Liens d'un forum de projet (AvroBB) : site du projet et dépôt de code, affichés sur l'index et en
 * tête du forum. Fonction pure.
 */

import type { ProjectLinks } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';

export interface ProjectLinkView {
	href: string;
	label: string;
	/** Nom d'hôte affiché à côté du libellé (github.com…) : on voit où mène le lien. */
	host: string;
}

export function projectLinkViews(links: ProjectLinks, lang: Lang): ProjectLinkView[] {
	const views: ProjectLinkView[] = [];
	for (const [href, label] of [
		[links.site, lang.common.projectSite],
		[links.repository, lang.common.projectRepository],
	] as const) {
		if (href !== null && URL.canParse(href)) views.push({ href, label, host: new URL(href).hostname.replace(/^www\./, '') });
	}
	return views;
}
