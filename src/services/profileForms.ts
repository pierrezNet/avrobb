/**
 * Validation des formulaires de modification de profile.php (branche « form_sent », une section à
 * la fois). Fonctions pures : le contrôleur fournit ce qui vient de la base (bannissements, pseudo
 * ressemblant, adresses déjà utilisées) et enregistre les changements renvoyés.
 *
 * Écarts assumés avec le PHP :
 * - seuls les champs affichés sont enregistrés : le PHP remettait à 0 use_pm (section « Vie
 *   privée », messagerie désactivée) ou reputation_enable (« Affichage », renommée désactivée)
 *   faute de case dans le formulaire ;
 * - les erreurs réaffichent le formulaire au lieu d'une page de message ;
 * - longueurs maximales vérifiées par le serveur (le PHP se fiait à l'attribut maxlength) ;
 * - pour un simple membre, l'adresse e-mail modifiée dans « Principal » suit les règles de
 *   changement d'adresse (adresse bannie, déjà utilisée) ; le PHP ne les vérifiait pas ici.
 */

import type { ProfileChanges } from '../domain/models.ts';
import { checkUsername, isBannedEmail, normalizeUsername, TIMEZONES, type UsernameError } from './accounts.ts';
import type { Ban } from './bans.ts';
import type { Censor } from './censor.ts';
import { validWebsiteUrl } from './links.ts';
import { isValidEmail } from './mail.ts';
import { isAllUppercase, punLinebreaks, punTrim } from './phpString.ts';
import { type PreparseError, type PreparseOptions, preparseBbcode } from './preparse.ts';
import { THEMES } from './themes.ts';

/** Sections modifiables par Node ; « admin » reste servie par le PHP (lot Administration). */
export const PROFILE_SECTIONS = ['essentials', 'personal', 'messaging', 'personality', 'display', 'privacy'] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

export function isProfileSection(value: string | undefined): value is ProfileSection {
	return (PROFILE_SECTIONS as readonly string[]).includes(value ?? '');
}

/** Champs texte et longueur des colonnes de users (ou maxlength du formulaire s'il est plus court). */
export const FIELD_MAX_LENGTHS = {
	realname: 40,
	title: 50,
	location: 30,
	url: 80,
	jabber: 75,
	icq: 12,
	msn: 50,
	aim: 30,
	yahoo: 30,
	adminNote: 30,
	email: 80,
} as const;
export type LimitedField = keyof typeof FIELD_MAX_LENGTHS;

export type ProfileError =
	| { kind: 'tooLong'; field: LimitedField; max: number }
	| { kind: 'username'; error: UsernameError }
	| { kind: 'usernameDupe'; existing: string }
	| { kind: 'invalidEmail' }
	| { kind: 'bannedEmail' }
	| { kind: 'dupeEmail' }
	| { kind: 'emailNotVerified' }
	| { kind: 'invalidWebsite' }
	| { kind: 'websiteNotAllowed' }
	| { kind: 'forbiddenTitle' }
	| { kind: 'badIcq' }
	| { kind: 'signatureTooLong'; max: number; excess: number }
	| { kind: 'signatureTooManyLines'; max: number }
	| { kind: 'bbcode'; error: PreparseError };

export interface FormResult {
	changes: ProfileChanges;
	errors: ProfileError[];
}

/** Lecture d'un champ texte : trim() de PHP, puis contrôle de longueur. */
function limited(field: LimitedField, raw: string, errors: ProfileError[]): string {
	const value = punTrim(raw);
	const max = FIELD_MAX_LENGTHS[field];
	if ([...value].length > max) errors.push({ kind: 'tooLong', field, max });
	return value;
}

// ——— Principal ———

export interface EssentialsInput {
	timezone: string;
	dst: boolean;
	username: string;
	email: string;
	adminNote: string;
	numPosts: string;
}

export interface EssentialsContext {
	/** Administrateur ou modérateur de groupe ($pun_user['is_admmod']). */
	isAnyModerator: boolean;
	isAdmin: boolean;
	/** Administrateur, modérateur avec g_mod_rename_users, ou le membre lui-même une fois (canRenameProfile()). */
	canRename: boolean;
	/** Le membre se renomme lui-même : le changement est alors définitif. */
	selfRename: boolean;
	currentUsername: string;
	currentEmail: string;
	guestLabel: string;
	bans: readonly Ban[];
	censor: Censor | null;
	/** Autre membre au pseudo identique ou trop ressemblant au nouveau (check_username()). */
	similarUsername: string | null;
	/** Autres membres utilisant déjà la nouvelle adresse. */
	emailOwners: readonly string[];
	allowBannedEmail: boolean;
	allowDupeEmail: boolean;
}

export interface EssentialsResult extends FormResult {
	/** Nouveau pseudo, si le membre est renommé (effets de bord dans le repository). */
	rename: string | null;
}

export function readEssentials(input: EssentialsInput, context: EssentialsContext): EssentialsResult {
	const errors: ProfileError[] = [];
	const timezone = Number(input.timezone);
	const changes: ProfileChanges = {
		timezone: (TIMEZONES as readonly number[]).includes(timezone) ? timezone : 0,
		dst: input.dst,
	};
	let rename: string | null = null;

	if (context.canRename) {
		const username = normalizeUsername(input.username);
		if (username !== context.currentUsername) {
			// Ordre de check_username() : forme, censure, pseudo déjà pris, pseudo banni.
			const usernameErrors = checkUsername(username, context.guestLabel, context.bans, context.censor);
			errors.push(
				...usernameErrors.filter((error) => error !== 'banned').map((error): ProfileError => ({ kind: 'username', error })),
				...(context.similarUsername !== null ? [{ kind: 'usernameDupe', existing: context.similarUsername } as const] : []),
				...usernameErrors.filter((error) => error === 'banned').map((error): ProfileError => ({ kind: 'username', error })),
			);
			rename = username;
			if (context.selfRename) changes.usernameChanged = true;
		}
	}

	if (context.isAnyModerator) {
		changes.adminNote = limited('adminNote', input.adminNote, errors);

		// Seul un administrateur corrige le nombre de messages.
		if (context.isAdmin) changes.numPosts = Math.max(0, Math.trunc(Number(input.numPosts)) || 0);
	}

	// Adresse facultative : celle, vérifiée, du fournisseur SSO à la première connexion. Un membre peut
	// l'effacer, pas en saisir une autre : sans lien de confirmation, une adresse non vérifiée ferait
	// du forum un relais vers un tiers (formulaire de contact, notifications). Les modérateurs et
	// administrateurs la corrigent.
	const email = limited('email', input.email, errors).toLowerCase();
	if (email !== '' && !isValidEmail(email)) errors.push({ kind: 'invalidEmail' });
	else if (email !== '' && !context.isAnyModerator && email !== context.currentEmail.toLowerCase())
		errors.push({ kind: 'emailNotVerified' });
	else if (email !== '' && email !== context.currentEmail.toLowerCase()) {
		if (isBannedEmail(email, context.bans) && !context.allowBannedEmail) errors.push({ kind: 'bannedEmail' });
		if (context.emailOwners.length > 0 && !context.allowDupeEmail) errors.push({ kind: 'dupeEmail' });
	}
	changes.email = email;

	return { changes, errors, rename };
}

// ——— Personnel ———

export interface PersonalInput {
	realname: string;
	title: string;
	location: string;
	url: string;
}

export interface PersonalContext {
	isAdmin: boolean;
	/** g_set_title du groupe. */
	canSetTitle: boolean;
	/** g_post_links : sans ce droit, aucun site web n'est accepté. */
	canPostLinks: boolean;
	/** Titres réservés, déjà en minuscules (« membre », « modérateur »…). */
	forbiddenTitles: readonly string[];
}

/** Titres réservés de profile.php : formes anglaises et titres traduits du forum. */
export function forbiddenTitles(translated: readonly string[]): string[] {
	return ['member', 'moderator', 'administrator', 'banned', 'guest', ...translated.map((title) => title.toLowerCase())];
}

export function readPersonal(input: PersonalInput, context: PersonalContext): FormResult {
	const errors: ProfileError[] = [];
	const changes: ProfileChanges = {
		realname: limited('realname', input.realname, errors),
		location: limited('location', input.location, errors),
	};

	const url = limited('url', input.url, errors);
	if (!context.canPostLinks) {
		if (url !== '') errors.push({ kind: 'websiteNotAllowed' });
		changes.url = '';
	} else if (url !== '') {
		const valid = validWebsiteUrl(url);
		if (valid === null) errors.push({ kind: 'invalidWebsite' });
		changes.url = valid ?? url;
	} else changes.url = '';

	if (context.isAdmin || context.canSetTitle) {
		const title = limited('title', input.title, errors);
		if (!context.isAdmin && title !== '' && context.forbiddenTitles.includes(title.toLowerCase())) errors.push({ kind: 'forbiddenTitle' });
		changes.title = title;
	}

	return { changes, errors };
}

// ——— Messagerie ———

export interface MessagingInput {
	jabber: string;
	icq: string;
	msn: string;
	aim: string;
	yahoo: string;
}

export function readMessaging(input: MessagingInput): FormResult {
	const errors: ProfileError[] = [];
	const changes: ProfileChanges = {
		jabber: limited('jabber', input.jabber, errors),
		icq: limited('icq', input.icq, errors),
		msn: limited('msn', input.msn, errors),
		aim: limited('aim', input.aim, errors),
		yahoo: limited('yahoo', input.yahoo, errors),
	};
	// Un numéro ICQ (UIN) ne contient que des chiffres.
	if (/[^0-9]/.test(changes.icq ?? '')) errors.push({ kind: 'badIcq' });
	return { changes, errors };
}

// ——— Personnalité (signature) ———

export interface SignatureContext {
	maxLength: number;
	maxLines: number;
	allowAllCaps: boolean;
	bbcode: boolean;
	isAnyModerator: boolean;
	preparse: Omit<PreparseOptions, 'isSignature'>;
}

/** utf8_ucwords(utf8_strtolower()) : signature tout en capitales ramenée en minuscules capitalisées. */
function ucwords(text: string): string {
	return text.toLowerCase().replace(/(^|[\s])(\S)/gu, (_match, space: string, letter: string) => space + letter.toUpperCase());
}

export function readSignature(raw: string, context: SignatureContext): FormResult & { signature: string } {
	let signature = punLinebreaks(punTrim(raw));
	const length = [...signature].length;
	const errors: ProfileError[] = [];

	if (length > context.maxLength) errors.push({ kind: 'signatureTooLong', max: context.maxLength, excess: length - context.maxLength });
	else if (signature.split('\n').length - 1 > context.maxLines - 1) errors.push({ kind: 'signatureTooManyLines', max: context.maxLines });
	else if (signature !== '' && !context.allowAllCaps && isAllUppercase(signature) && !context.isAnyModerator)
		signature = ucwords(signature);

	if (errors.length === 0 && context.bbcode && signature !== '') {
		const result = preparseBbcode(signature, { ...context.preparse, isSignature: true });
		errors.push(...result.errors.map((error): ProfileError => ({ kind: 'bbcode', error })));
		// preparse_bbcode() vide une signature réduite à des balises vides : elle est alors effacée.
		signature = result.errors.some((error) => error.kind === 'emptyAfterStrip') ? '' : result.text;
	}

	return {
		changes: { signature },
		errors: errors.filter((error) => !(error.kind === 'bbcode' && error.error.kind === 'emptyAfterStrip')),
		signature,
	};
}

// ——— Affichage ———

export interface DisplayInput {
	style: string;
	showSmilies: boolean;
	showSignatures: boolean;
	showAvatars: boolean;
	showImages: boolean;
	showSignatureImages: boolean;
	topicsPerPage: string;
	postsPerPage: string;
	reputationEnabled: boolean;
}

/** Cases proposées par le formulaire, selon les réglages du forum. */
export interface DisplayOptions {
	smilies: boolean;
	signatures: boolean;
	avatars: boolean;
	images: boolean;
	signatureImages: boolean;
	reputation: boolean;
}

/** Choix proposés dans « Affichage » (conditions de profile.php et de rep_profile.php). */
export function displayOptions(config: {
	smilies: boolean;
	signatureSmilies: boolean;
	signatures: boolean;
	avatars: boolean;
	bbcode: boolean;
	imgTag: boolean;
	signatureBbcode: boolean;
	signatureImgTag: boolean;
	reputationEnabled: boolean;
}): DisplayOptions {
	return {
		smilies: config.smilies || config.signatureSmilies,
		signatures: config.signatures,
		avatars: config.avatars,
		images: config.bbcode && config.imgTag,
		signatureImages: config.signatures && config.signatureBbcode && config.signatureImgTag,
		reputation: config.reputationEnabled,
	};
}

/** Messages ou sujets par page : vide = valeur du forum, sinon borné entre 3 et 75. */
function perPage(raw: string): number | null {
	const value = punTrim(raw);
	if (value === '') return null;
	return Math.min(75, Math.max(3, Math.trunc(Number.parseInt(value, 10)) || 0));
}

export function readDisplay(input: DisplayInput, options: DisplayOptions): FormResult {
	const changes: ProfileChanges = {
		topicsPerPage: perPage(input.topicsPerPage),
		postsPerPage: perPage(input.postsPerPage),
	};
	// Thème inconnu : on garde celui du membre (le PHP répondait « Mauvaise requête »).
	if ((THEMES as readonly string[]).includes(input.style)) changes.style = input.style;
	if (options.smilies) changes.showSmilies = input.showSmilies;
	if (options.signatures) changes.showSignatures = input.showSignatures;
	if (options.avatars) changes.showAvatars = input.showAvatars;
	if (options.images) changes.showImages = input.showImages;
	if (options.signatureImages) changes.showSignatureImages = input.showSignatureImages;
	if (options.reputation) changes.reputationEnabled = input.reputationEnabled;
	return { changes, errors: [] };
}

// ——— Vie privée ———

export interface PrivacyInput {
	emailSetting: string;
	notifyWithPost: boolean;
	autoNotify: boolean;
	usesPrivateMessages: boolean;
	notifyPrivateMessages: boolean;
	notifyPrivateMessagesFull: boolean;
}

export interface PrivacyOptions {
	/** Abonnements activés (forums ou sujets) : notifications avec le texte du message. */
	subscriptions: boolean;
	/** Abonnement automatique (abonnements aux sujets). */
	autoNotify: boolean;
	/** Bloc « Messages privés » (o_pms_enabled et g_pm). */
	privateMessages: boolean;
	/** Alertes par e-mail des MP (o_pms_notification). */
	privateMessageNotification: boolean;
	defaultEmailSetting: number;
}

export function readPrivacy(input: PrivacyInput, options: PrivacyOptions): FormResult {
	const setting = Number(input.emailSetting);
	const changes: ProfileChanges = {
		emailSetting: setting === 0 || setting === 1 || setting === 2 ? setting : options.defaultEmailSetting,
	};
	if (options.subscriptions) changes.notifyWithPost = input.notifyWithPost;
	if (options.autoNotify) changes.autoNotify = input.autoNotify;
	if (options.privateMessages) {
		changes.usesPrivateMessages = input.usesPrivateMessages;
		if (options.privateMessageNotification) {
			changes.notifyPrivateMessages = input.notifyPrivateMessages;
			changes.notifyPrivateMessagesFull = input.notifyPrivateMessagesFull;
		}
	}
	return { changes, errors: [] };
}
