/**
 * Règles de rédaction de post.php : validation du formulaire (dans l'ordre des erreurs du PHP),
 * texte d'une citation, abonnement et promotion de groupe. Fonctions pures ; les données
 * extérieures (bannissements, pseudo existant, censure) sont fournies par le contrôleur.
 *
 * Écart assumé : les caractères de 4 octets (émojis) sont conservés. strip_bad_multibyte_chars()
 * les remplaçait par « ? » du temps où la base était en utf8 sur 3 octets ; elle est désormais en
 * utf8mb4 (PHP compris), et PV affiche ses émoticônes en émojis.
 */

import type { Viewer } from '../domain/models.ts';
import type { Ban } from './bans.ts';
import type { Censor } from './censor.ts';
import { isValidEmail } from './mail.ts';
import { isAllUppercase, punLinebreaks, punTrim } from './phpString.ts';
import { type PreparseError, type PreparseOptions, preparseBbcode } from './preparse.ts';
import { checkUsername, isBannedEmail, normalizeUsername, type UsernameError } from './registration.ts';

/** PUN_MAX_POSTSIZE : taille maximale d'un message, en octets. */
export const MAX_POST_SIZE = 1_048_576;
/** Longueur maximale d'un sujet, en caractères. */
export const MAX_SUBJECT_LENGTH = 70;

export type PostError =
	| { kind: 'flood'; interval: number; wait: number }
	| { kind: 'noSubject' }
	| { kind: 'noSubjectAfterCensoring' }
	| { kind: 'tooLongSubject' }
	| { kind: 'allCapsSubject' }
	| { kind: 'username'; error: UsernameError }
	| { kind: 'usernameDupe'; existing: string }
	| { kind: 'invalidEmail' }
	| { kind: 'bannedEmail' }
	| { kind: 'tooLongMessage' }
	| { kind: 'allCapsMessage' }
	| { kind: 'bbcode'; error: PreparseError }
	| { kind: 'noMessage' }
	| { kind: 'noMessageAfterCensoring' };

/** Champs du formulaire, tels que reçus. */
export interface PostForm {
	/** req_subject (nouvelle discussion seulement). */
	subject: string | null;
	message: string;
	/** req_username et e-mail d'un invité. */
	username: string;
	email: string;
	hideSmilies: boolean;
	subscribe: boolean;
	stickTopic: boolean;
	preview: boolean;
}

export interface PostContext {
	viewer: Viewer;
	now: number;
	/** Administrateur ou modérateur de groupe, quel que soit le forum ($pun_user['is_admmod']). */
	isAnyModerator: boolean;
	/** Modérateur de ce forum ($is_admmod) : seul autorisé à épingler. */
	isForumModerator: boolean;
	config: {
		bbcode: boolean;
		subjectAllCaps: boolean;
		messageAllCaps: boolean;
		forceGuestEmail: boolean;
		allowBannedEmail: boolean;
	};
	preparse: Omit<PreparseOptions, 'isSignature' | 'allowLinks'>;
	censor: Censor | null;
	bans: readonly Ban[];
	/** Membre existant au pseudo identique ou trop ressemblant à celui de l'invité (check_username()). */
	similarUsername: string | null;
	guestLabel: string;
	/** Anti-flood (g_post_flood) : pas pour une modification (edit.php). */
	checkFlood?: boolean;
}

export interface ValidatedPost {
	errors: PostError[];
	subject: string;
	/** Message après pré-traitement du BBCode : le texte enregistré. */
	message: string;
	/** Message saisi (après trim et fins de ligne), réaffiché dans le formulaire. */
	originalMessage: string;
	/** Versions censurées, pour les notifications. */
	censoredSubject: string;
	censoredMessage: string;
	username: string;
	email: string;
	/** Adresse d'invité bannie mais acceptée (p_allow_banned_email) : alerte à la liste d'administration. */
	bannedEmail: boolean;
	hideSmilies: boolean;
	subscribe: boolean;
	stickTopic: boolean;
}

function floodError(viewer: Viewer, now: number): PostError | null {
	if (viewer.lastPost === null) return null;
	const elapsed = now - viewer.lastPost;
	const interval = viewer.group.postFlood;
	return elapsed < interval ? { kind: 'flood', interval, wait: interval - elapsed } : null;
}

function subjectErrors(subject: string, context: PostContext): PostError[] {
	if (subject === '') return [{ kind: 'noSubject' }];
	if (context.censor !== null && punTrim(context.censor(subject)) === '') return [{ kind: 'noSubjectAfterCensoring' }];
	if ([...subject].length > MAX_SUBJECT_LENGTH) return [{ kind: 'tooLongSubject' }];
	if (!context.config.subjectAllCaps && isAllUppercase(subject) && !context.isAnyModerator) return [{ kind: 'allCapsSubject' }];
	return [];
}

/** check_username() pour un invité : règle de forme, censure, pseudo pris, pseudo banni. */
function guestErrors(username: string, email: string, context: PostContext): { errors: PostError[]; bannedEmail: boolean } {
	const usernameErrors = checkUsername(normalizeUsername(username), context.guestLabel, context.bans, context.censor);
	const errors: PostError[] = [
		...usernameErrors.filter((error) => error !== 'banned').map((error): PostError => ({ kind: 'username', error })),
		...(context.similarUsername !== null ? [{ kind: 'usernameDupe', existing: context.similarUsername } as const] : []),
		...usernameErrors.filter((error) => error === 'banned').map((error): PostError => ({ kind: 'username', error })),
	];

	let bannedEmail = false;
	if (context.config.forceGuestEmail || email !== '') {
		if (!isValidEmail(email)) errors.push({ kind: 'invalidEmail' });
		if (isBannedEmail(email, context.bans)) {
			if (!context.config.allowBannedEmail) errors.push({ kind: 'bannedEmail' });
			bannedEmail = true;
		}
	}
	return { errors, bannedEmail };
}

/** Validation de post.php, erreurs dans l'ordre où le PHP les ajoute. */
export function validatePost(form: PostForm, context: PostContext): ValidatedPost {
	const { viewer, censor } = context;
	const errors: PostError[] = [];

	const flood = form.preview || context.checkFlood === false ? null : floodError(viewer, context.now);
	if (flood !== null) errors.push(flood);

	const subject = form.subject !== null ? punTrim(form.subject) : '';
	if (form.subject !== null) errors.push(...subjectErrors(subject, context));

	const username = viewer.isGuest ? punTrim(form.username) : viewer.username;
	const email = viewer.isGuest ? punTrim(form.email).toLowerCase() : viewer.email;
	let bannedEmail = false;
	if (viewer.isGuest) {
		const guest = guestErrors(username, email, context);
		errors.push(...guest.errors);
		bannedEmail = guest.bannedEmail;
	}

	const originalMessage = punLinebreaks(punTrim(form.message));
	if (Buffer.byteLength(originalMessage, 'utf8') > MAX_POST_SIZE) errors.push({ kind: 'tooLongMessage' });
	else if (!context.config.messageAllCaps && isAllUppercase(originalMessage) && !context.isAnyModerator)
		errors.push({ kind: 'allCapsMessage' });

	let message = originalMessage;
	if (context.config.bbcode) {
		const preparsed = preparseBbcode(
			message,
			{ ...context.preparse, isSignature: false, allowLinks: viewer.group.canPostLinks },
			errors.length > 0,
		);
		message = preparsed.text;
		errors.push(...preparsed.errors.map((error): PostError => ({ kind: 'bbcode', error })));
	}

	const censoredMessage = censor !== null ? punTrim(censor(message)) : message;
	if (errors.length === 0) {
		if (message === '') errors.push({ kind: 'noMessage' });
		else if (censor !== null && censoredMessage === '') errors.push({ kind: 'noMessageAfterCensoring' });
	}

	return {
		errors,
		subject,
		message,
		originalMessage,
		censoredSubject: censor !== null ? punTrim(censor(subject)) : subject,
		censoredMessage,
		username,
		email,
		bannedEmail,
		hideSmilies: form.hideSmilies,
		subscribe: form.subscribe,
		stickTopic: form.stickTopic && context.isForumModerator,
	};
}

/** Abonnement au sujet après une réponse (o_topic_subscriptions) : ajout, retrait ou rien. */
export function subscriptionChange(enabled: boolean, subscribe: boolean, isSubscribed: boolean): 'add' | 'remove' | null {
	if (!enabled) return null;
	if (subscribe && !isSubscribed) return 'add';
	if (!subscribe && isSubscribed) return 'remove';
	return null;
}

/** Case « Suivre cette discussion » cochée : choix précédent, abonnement automatique, ou déjà abonné. */
export function subscribeChecked(viewer: Viewer, isSubscribed: boolean, previous: boolean | null): boolean {
	if (previous !== null) return previous;
	return viewer.autoNotify || isSubscribed;
}

/** Groupe de promotion après ce message (g_promote_next_group), ou null. */
export function promotionGroup(viewer: Viewer): number | null {
	const { promoteNextGroup, promoteMinPosts } = viewer.group;
	return promoteNextGroup !== 0 && viewer.numPosts + 1 >= promoteMinPosts ? promoteNextGroup : null;
}

// --- Citation (post.php?qid=…) ----------------------------------------------------------------

/**
 * Mod Video Player de PV : dans une citation, une vidéo devient son identifiant (Dailymotion,
 * YouTube) ou un [url] (autres sites). Motifs PHP en mode « U » : les quantificateurs y sont
 * paresseux par défaut, d'où les « +? » ci-dessous ; « s » : le point y couvre aussi les sauts de ligne.
 */
const QUOTE_VIDEO: readonly [RegExp, string][] = [
	[/\[video\].+?\/video\/([^ _]+?)_.+?\[\/video\]/gis, '$1'],
	[/\[video largeur=([0-9]*?) hauteur=([0-9]*?)\].+?\/video\/([^ _]+?)_.+?\[\/video\]/gis, '$1'],
	[/\[video\].+?watch\?v=(.+?)\[\/video\]/gis, '$1'],
	[/\[video largeur=([0-9]*?) hauteur=([0-9]*?)\].+?watch\?v=(.+?)\[\/video\]/gis, '$1'],
	[/\[video\].+?vimeo.com\/([^ _]+?)\[\/video\]/gis, '[url]$1[/url]'],
	[/\[video largeur=([0-9]*?) hauteur=([0-9]*?)\].+?vimeo.com\/([^ _]+?)\[\/video\]/gis, '[url]$1[/url]'],
	[/\[video\].+?\/video\/([^ _]+?).html\[\/video\]/gis, '[url]$1[/url]'],
	[/\[video largeur=([0-9]*?) hauteur=([0-9]*?)\].+?\/video\/([^ _]+?).html\[\/video\]/gis, '[url]$1[/url]'],
	[/\[video\].+?\/videos\/([^ _]+?)\[\/video\]/gis, '[url]$1[/url]'],
	[/\[video largeur=([0-9]*?) hauteur=([0-9]*?)\].+?\/videos\/([^ _]+?)\[\/video\]/gis, '[url]$1[/url]'],
	[/\[video\].+?\/fplayer\/([0-9]+?)\/(.+?)\/\[\/video\]/gis, '[url]$1[/url]'],
	[/\[video largeur=([0-9]*?) hauteur=([0-9]*?)\].+?\/fplayer\/([0-9]+?)\/(.+?)\/\[\/video\]/gis, '[url]$1[/url]'],
];

/**
 * split_text($text, '[code]', '[/code]') : blocs [code] paresseux (mode « U »), tabulations du
 * reste remplacées.
 */
function splitCode(text: string, indentSpaces: number): { inside: string[]; outside: string[] } {
	const parts = text.split(/\[code\](.*?)\[\/code\]/s);
	const inside = parts.filter((_, i) => i % 2 === 1);
	const outside = parts
		.filter((_, i) => i % 2 === 0)
		.map((part) => (indentSpaces !== 8 ? part.replaceAll('\t', ' '.repeat(indentSpaces)) : part));
	return { inside, outside };
}

/** Images ramenées à leur adresse dans une citation (mode « U » : quantificateurs gourmands). */
const QUOTE_IMG = /\[img(?:=(?:[^[]*))?\]((ht|f)tps?:\/\/)([^\t\n\v\f\r <"]*)\[\/img\]/g;

/** Auteur entre guillemets s'il contient des crochets ou commence et finit par un guillemet. */
function quotedAuthor(poster: string): string {
	if (poster.includes('[') || poster.includes(']')) return poster.includes("'") ? `"${poster}"` : `'${poster}'`;
	const ends = poster.charAt(0) + poster.charAt(poster.length - 1);
	if (ends === "''") return `"${poster}"`;
	if (ends === '""') return `'${poster}'`;
	return poster;
}

export interface QuoteOptions {
	bbcode: boolean;
	indentSpaces: number;
	censor: Censor | null;
	/** $lang_common['wrote'] (« Tessy a écrit : »), pour une citation sans BBCode. */
	wrote: (author: string) => string;
}

/**
 * Texte initial du formulaire pour citer un message. Non échappé : la vue l'échappe dans le
 * <textarea> (le PHP l'échappait lui-même avant de l'y écrire).
 */
export function quoteText(poster: string, source: string, options: QuoteOptions): string {
	let message = source;
	for (const [pattern, replacement] of QUOTE_VIDEO) message = message.replace(pattern, replacement);

	if (message.includes('[code]') && message.includes('[/code]')) {
		const { inside, outside } = splitCode(message, options.indentSpaces);
		message = outside
			.map((part) => part.replace(QUOTE_IMG, '$1$3'))
			.map((part, i) => part + (inside[i] !== undefined ? `[code]${inside[i]}[/code]` : ''))
			.join('');
	} else message = message.replace(QUOTE_IMG, '$1$3');

	if (options.censor !== null) message = options.censor(message);

	return options.bbcode ? `[quote=${quotedAuthor(poster)}]${message}[/quote]\n` : `> ${options.wrote(poster)}\n\n> ${message}\n`;
}
