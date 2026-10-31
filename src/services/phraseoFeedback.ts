/**
 * Retours de l'application Phraséo (formulaire « J'ai un retour », sans compte) : validation de ce
 * qu'envoie le relais de Phraséo, sujet et message du forum. Fonctions pures.
 *
 * Le relais valide déjà le formulaire ; le forum revalide quand même (défense en profondeur) avec les
 * mêmes limites. L'auteur n'a pas de compte : son texte est publié tel quel, sans BBCode.
 */

import { MAX_SUBJECT_LENGTH } from './posting.ts';

/** Types proposés par le formulaire de Phraséo (worker/src/relay.ts de Phraséo, FEEDBACK_TYPES). */
export const PHRASEO_FEEDBACK_TYPES = ['Erreur de phraséologie', 'Suggestion / idée', 'Bug technique', 'Autre'] as const;

export interface PhraseoFeedback {
	type: (typeof PHRASEO_FEEDBACK_TYPES)[number];
	message: string;
	/** Moyen de recontacter l'auteur : jamais publié, seulement envoyé aux administrateurs. */
	contact: string;
	mode: 'VFR' | 'IFR' | '';
	level: string;
	lang: 'fr' | 'en' | '';
}

const MAX_MESSAGE = 1800;
const MAX_CONTACT = 120;
const MAX_LEVEL = 20;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Retour reçu du relais, ou null s'il ne respecte pas le format du formulaire. */
export function parsePhraseoFeedback(input: unknown): PhraseoFeedback | null {
	if (input === null || typeof input !== 'object') return null;
	const raw = input as Record<string, unknown>;
	const type = text(raw.type);
	const message = text(raw.message);
	const contact = text(raw.contact);
	const mode = text(raw.mode);
	const level = text(raw.level);
	const lang = text(raw.lang);

	if (!(PHRASEO_FEEDBACK_TYPES as readonly string[]).includes(type)) return null;
	if (message === '' || message.length > MAX_MESSAGE) return null;
	if (contact.length > MAX_CONTACT || level.length > MAX_LEVEL) return null;
	if (mode !== 'VFR' && mode !== 'IFR' && mode !== '') return null;
	if (lang !== 'fr' && lang !== 'en' && lang !== '') return null;

	return { type: type as PhraseoFeedback['type'], message, contact, mode, level, lang };
}

/**
 * Texte de l'auteur rendu inerte : une espace sans chasse après chaque crochet ouvrant empêche toute
 * balise BBCode ([url], [img]…) sans changer ce qui s'affiche.
 */
export function inertBbcode(source: string): string {
	return source.replace(/\[/g, '[​');
}

/** Sujet : « [Phraséo] Bug technique : début du message… », dans la limite de longueur des sujets. */
export function phraseoFeedbackSubject(feedback: PhraseoFeedback, texts: { subjectTag: string; subjectSeparator: string }): string {
	const head = `${texts.subjectTag} ${feedback.type}${texts.subjectSeparator}`;
	const firstLine = feedback.message.split('\n')[0]?.replace(/\s+/g, ' ').trim() ?? '';
	const room = MAX_SUBJECT_LENGTH - head.length;
	const excerpt = firstLine.length <= room ? firstLine : `${firstLine.slice(0, Math.max(0, room - 1)).trimEnd()}…`;
	return `${head}${inertBbcode(excerpt)}`.slice(0, MAX_SUBJECT_LENGTH);
}

/** Message : rappel, contexte de l'application (type, règle de vol, niveau, langue), puis le texte de l'auteur. */
export function phraseoFeedbackMessage(
	feedback: PhraseoFeedback,
	texts: { header: string; none: string; fields: { type: string; mode: string; level: string; lang: string } },
): string {
	const value = (v: string) => (v === '' ? texts.none : inertBbcode(v));
	const context = [
		`[b]${texts.fields.type} :[/b] ${feedback.type}`,
		`[b]${texts.fields.mode} :[/b] ${value(feedback.mode)}`,
		`[b]${texts.fields.level} :[/b] ${value(feedback.level)}`,
		`[b]${texts.fields.lang} :[/b] ${value(feedback.lang)}`,
	].join('\n');
	return `[i]${texts.header}[/i]\n\n${context}\n\n${inertBbcode(feedback.message)}`;
}
