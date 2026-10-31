/**
 * Modèle de vue des pages d'information (terms.php, privacy.php, faq.php) : rubriques présentées
 * comme les forums d'une catégorie, sans formulaire. Contenu modifié dans l'administration, sinon
 * textes par défaut de src/lang/fr/staticPages.ts. Fonction pure.
 */

import type { StaticPageContent, StaticPageId, StaticSection, Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import type { StaticPage } from '../lang/fr/staticPages.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import { type Crumb, crumbs } from './navigation.ts';

export type { StaticPageId } from '../domain/models.ts';

export interface StaticPageView {
	title: string;
	intro: string;
	crumbs: Crumb[];
	sections: (StaticSection & { anchor: string })[];
	updated: string;
	contact: { title: string; text: string; email: string } | null;
}

/** Contenu affiché : celui de l'administration, sinon le texte par défaut. */
export function staticPageContent(id: StaticPageId, saved: StaticPageContent | undefined, lang: Lang): StaticPageContent {
	if (saved !== undefined) return saved;
	const { title, intro, sections } = lang.staticPages[id];
	return { title, intro, sections, updatedAt: null };
}

export function buildStaticPage(input: {
	id: StaticPageId;
	saved: StaticPageContent | undefined;
	adminEmail: string;
	viewer: Viewer;
	lang: Lang;
	dateWords: DateWords;
	now: number;
}): StaticPageView {
	const { id, lang } = input;
	const t = lang.staticPages;
	const page = staticPageContent(id, input.saved, lang);
	// Le contact de la page reste valable même quand l'administration a remplacé ses textes.
	const defaults: StaticPage = t[id];
	const pageContact = defaults.contact;
	return {
		title: page.title,
		intro: page.intro,
		crumbs: crumbs({ label: lang.common.index, href: 'index.php' }, { label: page.title, href: `${id}.php` }),
		sections: page.sections.map((section, index) => ({ ...section, anchor: `${id}-${index + 1}` })),
		updated:
			page.updatedAt !== null
				? t.updatedOn(formatTime(page.updatedAt, viewerTimeSettings(input.viewer), input.dateWords, input.now, true))
				: t.updated,
		contact:
			pageContact !== undefined
				? { title: t.contactTitle, ...pageContact }
				: input.adminEmail !== ''
					? { title: t.contactTitle, text: t.contactText, email: input.adminEmail }
					: null,
	};
}
