/**
 * Listes affichées dans la langue de la page : titres des discussions, noms et descriptions des
 * forums remplacés par leur traduction automatique quand il y en a une (texte d'origine inchangé).
 * Pour les listes (accueil, page d'un forum) ; la page d'un sujet garde aussi le texte d'origine
 * (presenters/topicPage.ts, « Voir l'original »).
 */

import type { TranslationReader } from '../repositories/TranslationRepository.ts';
import type { ContentLocale } from '../services/translation.ts';

/** Discussions avec leur titre traduit. */
export async function withTranslatedSubjects<T extends { id: number; subject: string }>(
	translations: TranslationReader,
	topics: readonly T[],
	locale: ContentLocale,
): Promise<T[]> {
	if (topics.length === 0) return [...topics];
	const subjects = await translations.find(
		'subject',
		topics.map((topic) => ({ id: topic.id, text: topic.subject })),
		locale,
	);
	return topics.map((topic) => ({ ...topic, subject: subjects.get(topic.id) ?? topic.subject }));
}

/** Forums avec leur nom et leur description traduits. */
export async function withTranslatedForums<T extends { id: number; name: string; descriptionHtml: string }>(
	translations: TranslationReader,
	forums: readonly T[],
	locale: ContentLocale,
): Promise<T[]> {
	if (forums.length === 0) return [...forums];
	const [names, descriptions] = await Promise.all([
		translations.find(
			'forum_name',
			forums.map((forum) => ({ id: forum.id, text: forum.name })),
			locale,
		),
		translations.find(
			'forum_desc',
			forums.map((forum) => ({ id: forum.id, text: forum.descriptionHtml })),
			locale,
		),
	]);
	return forums.map((forum) => ({
		...forum,
		name: names.get(forum.id) ?? forum.name,
		descriptionHtml: descriptions.get(forum.id) ?? forum.descriptionHtml,
	}));
}
