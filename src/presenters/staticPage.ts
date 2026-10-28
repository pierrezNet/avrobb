/**
 * Modèle de vue des pages d'information (terms.php, privacy.php, faq.php) : rubriques présentées
 * comme les forums d'une catégorie, sans formulaire. Fonction pure.
 */

import type { Lang } from '../lang/fr/index.ts';
import type { StaticSection } from '../lang/fr/staticPages.ts';
import { type Crumb, crumbs } from './navigation.ts';

export type StaticPageId = 'terms' | 'privacy' | 'faq';

export interface StaticPageView {
	title: string;
	intro: string;
	crumbs: Crumb[];
	sections: (StaticSection & { anchor: string })[];
	updated: string;
	contact: { title: string; text: string; email: string } | null;
}

export function buildStaticPage(id: StaticPageId, lang: Lang, adminEmail: string): StaticPageView {
	const t = lang.staticPages;
	const page = t[id];
	const href = `${id}.php`;
	return {
		title: page.title,
		intro: page.intro,
		crumbs: crumbs({ label: lang.common.index, href: 'index.php' }, { label: page.title, href }),
		sections: page.sections.map((section, index) => ({ ...section, anchor: `${id}-${index + 1}` })),
		updated: t.updated,
		contact: adminEmail !== '' ? { title: t.contactTitle, text: t.contactText, email: adminEmail } : null,
	};
}
