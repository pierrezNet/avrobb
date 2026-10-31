/**
 * Retours des applications sources (Phraséo, Donne Ton Point : formulaire « J'ai un retour », sans
 * compte) : profil de chaque application, validation de ce qu'envoie son relais, sujet et message du
 * forum. Fonctions pures.
 *
 * Le relais valide déjà le formulaire ; le forum revalide quand même (défense en profondeur) avec les
 * mêmes limites. L'auteur n'a pas de compte : son texte est publié tel quel, sans BBCode.
 */

import type { FeedbackDestination, FeedbackSourceId } from '../domain/models.ts';
import type { MailTemplateName } from './mail.ts';
import { MAX_SUBJECT_LENGTH } from './posting.ts';

/** Champ propre à une application (Phraséo : règle de vol, niveau), facultatif. */
export interface FeedbackDetailField {
	name: string;
	maxLength: number;
	/** Valeurs admises (la chaîne vide comprise) ; absent : texte libre. */
	values?: readonly string[];
}

/** Profil d'une application source : ce que son formulaire envoie et où ses retours arrivent. */
export interface FeedbackSource {
	id: FeedbackSourceId;
	/** Types proposés par le formulaire de l'application. */
	types: readonly string[];
	/** Champs propres, affichés entre le type et la langue dans le message. */
	details: readonly FeedbackDetailField[];
	/** Préfixe des réglages <prefix>_forum, _user et _target de la table config. */
	configPrefix: string;
	mailTemplate: MailTemplateName;
}

export const FEEDBACK_SOURCES: Readonly<Record<FeedbackSourceId, FeedbackSource>> = {
	phraseo: {
		id: 'phraseo',
		// worker/src/relay.ts de Phraséo, FEEDBACK_TYPES
		types: ['Erreur de phraséologie', 'Suggestion / idée', 'Bug technique', 'Autre'],
		details: [
			{ name: 'mode', maxLength: 3, values: ['VFR', 'IFR', ''] },
			{ name: 'level', maxLength: 20 },
		],
		configPrefix: 'o_phraseo_feedback',
		mailTemplate: 'app_feedback',
	},
	donneTonPoint: {
		id: 'donneTonPoint',
		// Pages Function de donnetonpoint qui appelle DonneTonPointFeedback
		types: ['Bug', 'Suggestion / idée', 'Question', 'Autre'],
		details: [],
		configPrefix: 'o_dtp_feedback',
		mailTemplate: 'app_feedback',
	},
};

export const FEEDBACK_SOURCE_IDS = Object.keys(FEEDBACK_SOURCES) as FeedbackSourceId[];

export function isFeedbackSourceId(value: unknown): value is FeedbackSourceId {
	return typeof value === 'string' && Object.hasOwn(FEEDBACK_SOURCES, value);
}

/** Forum privé et compte système tous deux désignés, sinon fonction désactivée. */
export function feedbackDestination(forumId: number, userId: number, target: number): FeedbackDestination | null {
	// Destination identique au forum privé : sans objet, bouton masqué
	const targetForumId = target > 0 && target !== forumId ? target : null;
	return forumId > 0 && userId > 0 ? { forumId, userId, targetForumId } : null;
}

export interface AppFeedback {
	source: FeedbackSourceId;
	type: string;
	message: string;
	/** Pseudo choisi par l'auteur, publié avec le retour (facultatif). */
	pseudo: string;
	/** Moyen de recontacter l'auteur : jamais publié, seulement envoyé aux administrateurs. */
	contact: string;
	lang: 'fr' | 'en' | '';
	/** Champs propres à l'application, dans l'ordre du profil. */
	details: readonly { name: string; value: string }[];
}

/** Textes d'une application source (lang/fr/appFeedback.ts). */
export interface FeedbackTexts {
	/** Nom de l'application, dans l'e-mail aux administrateurs. */
	appName: string;
	authorName: string;
	subjectTag: string;
	subjectSeparator: string;
	fields: { pseudo: string; type: string; lang: string };
	/** Libellés des champs propres à l'application, par nom. */
	details: Readonly<Record<string, string>>;
	none: string;
	header: string;
	publicHeader: string;
	anonymous: string;
	noContact: string;
}

const MAX_MESSAGE = 1800;
const MAX_CONTACT = 120;
const MAX_PSEUDO = 40;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

function parseDetail(field: FeedbackDetailField, raw: unknown): string | null {
	const value = text(raw);
	if (value.length > field.maxLength) return null;
	if (field.values !== undefined && !field.values.includes(value)) return null;
	return value;
}

/** Retour reçu du relais d'une application, ou null s'il ne respecte pas le format de son formulaire. */
export function parseAppFeedback(source: FeedbackSource, input: unknown): AppFeedback | null {
	if (input === null || typeof input !== 'object') return null;
	const raw = input as Record<string, unknown>;
	const type = text(raw.type);
	const message = text(raw.message);
	const contact = text(raw.contact);
	// Ancien formulaire (sans pseudo) accepté : le champ est facultatif
	const pseudo = text(raw.pseudo).replace(/\s+/g, ' ');
	const lang = text(raw.lang);

	if (!source.types.includes(type)) return null;
	if (message === '' || message.length > MAX_MESSAGE) return null;
	if (contact.length > MAX_CONTACT || pseudo.length > MAX_PSEUDO) return null;
	if (lang !== 'fr' && lang !== 'en' && lang !== '') return null;

	const details: { name: string; value: string }[] = [];
	for (const field of source.details) {
		const value = parseDetail(field, raw[field.name]);
		if (value === null) return null;
		details.push({ name: field.name, value });
	}
	return { source: source.id, type, message, pseudo, contact, lang, details };
}

/**
 * Texte de l'auteur rendu inerte : une espace sans chasse après chaque crochet ouvrant empêche toute
 * balise BBCode ([url], [img]…) sans changer ce qui s'affiche.
 */
export function inertBbcode(source: string): string {
	return source.replace(/\[/g, '[​');
}

/** Sujet : « [Phraséo] Bug technique : début du message… », dans la limite de longueur des sujets. */
export function appFeedbackSubject(feedback: AppFeedback, texts: Pick<FeedbackTexts, 'subjectTag' | 'subjectSeparator'>): string {
	const head = `${texts.subjectTag} ${feedback.type}${texts.subjectSeparator}`;
	const firstLine = feedback.message.split('\n')[0]?.replace(/\s+/g, ' ').trim() ?? '';
	const room = MAX_SUBJECT_LENGTH - head.length;
	const excerpt = firstLine.length <= room ? firstLine : `${firstLine.slice(0, Math.max(0, room - 1)).trimEnd()}…`;
	return `${head}${inertBbcode(excerpt)}`.slice(0, MAX_SUBJECT_LENGTH);
}

/**
 * Retour accepté (publié dans le forum public) : le rappel d'en-tête, qui parlait du contact envoyé
 * aux administrateurs, devient une simple mention d'origine. Le reste du message est inchangé.
 */
export function publicAppFeedbackMessage(message: string, texts: Pick<FeedbackTexts, 'header' | 'publicHeader'>): string {
	return message.replace(`[i]${texts.header}[/i]`, `[i]${texts.publicHeader}[/i]`);
}

/** Message : rappel, contexte (pseudo, type, champs propres à l'application, langue), puis le texte de l'auteur. */
export function appFeedbackMessage(feedback: AppFeedback, texts: Pick<FeedbackTexts, 'header' | 'none' | 'fields' | 'details'>): string {
	const value = (v: string) => (v === '' ? texts.none : inertBbcode(v));
	const line = (label: string, v: string) => `[b]${label} :[/b] ${v}`;
	const context = [
		line(texts.fields.pseudo, value(feedback.pseudo)),
		line(texts.fields.type, feedback.type),
		...feedback.details.map((detail) => line(texts.details[detail.name] ?? detail.name, value(detail.value))),
		line(texts.fields.lang, value(feedback.lang)),
	].join('\n');
	return `[i]${texts.header}[/i]\n\n${context}\n\n${inertBbcode(feedback.message)}`;
}
