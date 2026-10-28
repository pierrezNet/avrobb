/**
 * Pages d'information modifiées dans l'administration (admin_pages.php), enregistrées en JSON dans
 * la table config (clés o_page_<page>, propres à AvroBB et ignorées par le PHP) : lecture tolérante,
 * écriture, et balisage simple du formulaire d'édition. Fonctions pures.
 *
 * Balisage du contenu : « ## Titre » ouvre une rubrique, une ligne vide sépare deux paragraphes, une
 * ligne « [Libellé](adresse) » ajoute un lien à la rubrique. Tout reste du texte : il est échappé à
 * l'affichage, seules les adresses des liens sont contrôlées (page du forum ou http(s)).
 */

import type { StaticPageContent, StaticPageId, StaticSection } from '../domain/models.ts';

export const STATIC_PAGE_IDS: readonly StaticPageId[] = ['terms', 'privacy', 'faq'];

export const staticPageKey = (id: StaticPageId): string => `o_page_${id}`;

export const isStaticPageId = (value: string): value is StaticPageId => (STATIC_PAGE_IDS as readonly string[]).includes(value);

export const STATIC_TITLE_MAX = 80;
export const STATIC_INTRO_MAX = 1000;
export const STATIC_BODY_MAX = 30000;

/** Adresse de lien acceptée : une page du forum (« faq.php », « search.php?action=… ») ou http(s). */
export function isSafeLink(href: string): boolean {
	return /^[a-z_]+\.php(?:[?#][^\s"<>]*)?$/i.test(href) || /^https?:\/\/[^\s"<>]+$/i.test(href);
}

const LINK_LINE = /^\[([^\]]{1,80})\]\(([^)\s]{1,300})\)$/;

/** Contenu balisé → rubriques. Le texte avant la première rubrique forme une rubrique sans titre. */
export function parseStaticBody(body: string): StaticSection[] {
	const sections: StaticSection[] = [];
	let current: StaticSection | null = null;
	let paragraph: string[] = [];
	const flush = () => {
		if (paragraph.length > 0 && current !== null) current.paragraphs.push(paragraph.join(' '));
		paragraph = [];
	};
	for (const raw of body.replaceAll('\r\n', '\n').split('\n')) {
		const line = raw.trim();
		if (line.startsWith('## ')) {
			flush();
			current = { title: line.slice(3).trim(), paragraphs: [] };
			sections.push(current);
			continue;
		}
		if (current === null) {
			if (line === '') continue;
			current = { title: '', paragraphs: [] };
			sections.push(current);
		}
		const link = LINK_LINE.exec(line);
		if (link !== null && isSafeLink(link[2] ?? '')) {
			flush();
			current.links = [...(current.links ?? []), { label: link[1] ?? '', href: link[2] ?? '' }];
		} else if (line === '') flush();
		else paragraph.push(line);
	}
	flush();
	return sections.filter((section) => section.title !== '' || section.paragraphs.length > 0 || (section.links?.length ?? 0) > 0);
}

/** Rubriques → contenu balisé (formulaire d'édition). */
export function formatStaticBody(sections: readonly StaticSection[]): string {
	return sections
		.map((section) =>
			[
				...(section.title !== '' ? [`## ${section.title}`] : []),
				section.paragraphs.join('\n\n'),
				...(section.links ?? []).map((link) => `[${link.label}](${link.href})`),
			]
				.filter((part) => part !== '')
				.join('\n\n'),
		)
		.join('\n\n');
}

/** Contenu enregistré ; null si la clé manque ou est illisible (texte par défaut). */
export function parseStaticPage(value: string | undefined): StaticPageContent | null {
	if (value === undefined || value === '') return null;
	let data: unknown;
	try {
		data = JSON.parse(value);
	} catch {
		return null;
	}
	if (typeof data !== 'object' || data === null) return null;
	const { title, intro, body, updatedAt } = data as Record<string, unknown>;
	if (typeof title !== 'string' || typeof intro !== 'string' || typeof body !== 'string') return null;
	return {
		title,
		intro,
		sections: parseStaticBody(body),
		updatedAt: typeof updatedAt === 'number' ? updatedAt : null,
	};
}

/** Valeur enregistrée : le contenu reste sous sa forme balisée, relue par parseStaticPage(). */
export function serializeStaticPage(page: { title: string; intro: string; body: string; updatedAt: number }): string {
	return JSON.stringify(page);
}

export type StaticPageError = 'title' | 'intro' | 'body';

/** Formulaire d'édition d'une page : titre obligatoire, longueurs bornées. */
export function readStaticPageForm(
	read: (name: string) => string,
):
	| { kind: 'ok'; title: string; intro: string; body: string }
	| { kind: 'error'; errors: StaticPageError[]; title: string; intro: string; body: string } {
	const title = read('title').trim();
	const intro = read('intro').trim().replaceAll('\r\n', '\n');
	const body = read('body').replaceAll('\r\n', '\n').trim();
	const errors: StaticPageError[] = [];
	if (title === '' || [...title].length > STATIC_TITLE_MAX) errors.push('title');
	if ([...intro].length > STATIC_INTRO_MAX) errors.push('intro');
	if ([...body].length > STATIC_BODY_MAX || parseStaticBody(body).length === 0) errors.push('body');
	return errors.length > 0 ? { kind: 'error', errors, title, intro, body } : { kind: 'ok', title, intro, body };
}
