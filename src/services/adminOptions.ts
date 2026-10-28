/**
 * Options du forum (admin_options.php) : description des champs du formulaire et règles de
 * validation du PHP, en fonctions pures.
 *
 * Fidèle à FluxBB : intval()/floatval() sur les nombres, bornes et valeurs de repli identiques,
 * messages vides remplacés par le texte par défaut avec l'option correspondante désactivée, et
 * seules les clés qui changent sont écrites (une chaîne vide devient NULL).
 *
 * Options de FluxBB sans effet dans AvroBB retirées du formulaire (et donc jamais écrites) :
 * compression GZip (affaire du serveur web), formats de date et d'heure (PV impose d/m/Y et H:i),
 * langue par défaut (forum en français), affichage du numéro de version de FluxBB.
 */

import { isValidEmail } from './mail.ts';
import { punLinebreaks, punTrim } from './phpString.ts';
import { TIMEZONES } from './registration.ts';
import { THEMES } from './themes.ts';

/** Durées de cache des flux proposées par le PHP (minutes, 0 : pas de cache). */
export const FEED_TTLS = [0, 5, 15, 30, 60] as const;

export type OptionChoices = 'timezones' | 'styles' | 'feedTypes' | 'feedTtls' | 'reportMethods' | 'emailSettings';

export type OptionInput =
	| { kind: 'text'; maxLength: number; type: 'text' | 'email' | 'url' }
	| { kind: 'number'; min: number; max: number }
	| { kind: 'textarea'; rows: number }
	| { kind: 'yesno' }
	| { kind: 'select' | 'radio'; choices: OptionChoices }
	| { kind: 'smtpPass' };

export interface OptionField {
	/** Nom sans le préfixe o_ : champ form[<key>] et clé o_<key> de la table config. */
	key: string;
	input: OptionInput;
}

export type OptionSectionId =
	| 'essentials'
	| 'timeouts'
	| 'display'
	| 'features'
	| 'feed'
	| 'reports'
	| 'avatars'
	| 'email'
	| 'registration'
	| 'announcement'
	| 'maintenance';

const text = (maxLength: number, type: 'text' | 'email' | 'url' = 'text'): OptionInput => ({ kind: 'text', maxLength, type });
const num = (min: number, max = 99999): OptionInput => ({ kind: 'number', min, max });
const yesno: OptionInput = { kind: 'yesno' };
const field = (key: string, input: OptionInput): OptionField => ({ key, input });
const flags = (...keys: string[]): OptionField[] => keys.map((key) => field(key, yesno));

export interface OptionSection<Id extends string = string> {
	id: Id;
	fields: readonly OptionField[];
}

/** Champs dans l'ordre du formulaire PHP. */
export const OPTION_SECTIONS: readonly OptionSection<OptionSectionId>[] = [
	{
		id: 'essentials',
		fields: [
			field('board_title', text(255)),
			field('board_desc', text(255)),
			field('base_url', text(100, 'url')),
			field('default_timezone', { kind: 'select', choices: 'timezones' }),
			field('default_dst', yesno),
			field('default_style', { kind: 'select', choices: 'styles' }),
		],
	},
	{
		id: 'timeouts',
		fields: [field('timeout_visit', num(1)), field('timeout_online', num(1)), field('redirect_delay', num(0, 999))],
	},
	{
		id: 'display',
		fields: [
			...flags('show_user_info', 'show_post_count', 'smilies', 'smilies_sig', 'make_links'),
			field('topic_review', num(0, 999)),
			field('disp_topics_default', num(3, 75)),
			field('disp_posts_default', num(3, 75)),
			field('indent_num_spaces', num(0, 999)),
			field('quote_depth', num(1, 999)),
		],
	},
	{
		id: 'features',
		fields: [
			...flags('quickpost', 'users_online', 'censoring', 'signatures', 'show_dot', 'topic_views', 'quickjump', 'search_all_forums'),
			field('additional_navlinks', { kind: 'textarea', rows: 3 }),
		],
	},
	{
		id: 'feed',
		fields: [field('feed_type', { kind: 'radio', choices: 'feedTypes' }), field('feed_ttl', { kind: 'select', choices: 'feedTtls' })],
	},
	{
		id: 'reports',
		fields: [field('report_method', { kind: 'radio', choices: 'reportMethods' }), field('mailing_list', { kind: 'textarea', rows: 5 })],
	},
	{
		id: 'avatars',
		fields: [
			field('avatars', yesno),
			field('avatars_dir', text(50)),
			field('avatars_width', num(1)),
			field('avatars_height', num(1)),
			field('avatars_size', num(1, 999999)),
		],
	},
	{
		id: 'email',
		fields: [
			field('admin_email', text(80, 'email')),
			field('webmaster_email', text(80, 'email')),
			...flags('forum_subscriptions', 'topic_subscriptions'),
			field('smtp_host', text(100)),
			field('smtp_user', text(50)),
			field('smtp_pass', { kind: 'smtpPass' }),
			field('smtp_ssl', yesno),
		],
	},
	{
		id: 'registration',
		fields: [
			...flags('regs_allow', 'regs_verify', 'regs_report', 'rules'),
			field('rules_message', { kind: 'textarea', rows: 10 }),
			field('default_email_setting', { kind: 'radio', choices: 'emailSettings' }),
		],
	},
	{ id: 'announcement', fields: [field('announcement', yesno), field('announcement_message', { kind: 'textarea', rows: 5 })] },
	{ id: 'maintenance', fields: [field('maintenance', yesno), field('maintenance_message', { kind: 'textarea', rows: 5 })] },
];

export type OptionsError = 'missingTitle' | 'invalidBaseUrl' | 'invalidAdminEmail' | 'invalidWebmasterEmail' | 'smtpMismatch' | 'timeout';

export type OptionsResult =
	| { kind: 'badRequest' }
	| { kind: 'invalid'; errors: OptionsError[] }
	/** Valeurs par clé de config (o_…), prêtes à comparer avec la table. */
	| { kind: 'ok'; values: Map<string, string> };

export interface OptionsDefaults {
	announcement: string;
	rules: string;
	maintenance: string;
}

/** intval() de PHP : entier en tête de chaîne, 0 sinon. */
function intval(value: string): number {
	const match = /^\s*[+-]?\d+/.exec(value);
	return match !== null ? Number.parseInt(match[0], 10) : 0;
}

/** floatval() de PHP : nombre en tête de chaîne, 0 sinon. */
function floatval(value: string): number {
	const match = /^\s*[+-]?(\d+\.?\d*|\.\d+)/.exec(value);
	return match !== null ? Number.parseFloat(match[0]) : 0;
}

const atLeast = (value: number, min: number, fallback: number): number => (value >= min ? value : fallback);
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * URL de base sans barre oblique finale ; un nom de domaine accentué passe en punycode (idn_to_ascii()
 * du PHP). null si l'adresse n'est pas une URL.
 */
function normalizeBaseUrl(value: string): string | null {
	let url = value.endsWith('/') ? value.slice(0, -1) : value;
	// biome-ignore lint/suspicious/noControlCharactersInRegex: détection des caractères non ASCII, comme le PHP
	if (/[^\x00-\x7F]/.test(url)) {
		if (!URL.canParse(url)) return null;
		url = new URL(url).href;
		if (url.endsWith('/') && !value.endsWith('/')) url = url.slice(0, -1);
	}
	return url;
}

/**
 * Lit et valide le formulaire comme admin_options.php. `read(key)` renvoie form[<key>] (chaîne vide
 * si absent). Le mot de passe SMTP n'est inclus que si « modifier » est coché.
 */
export function readOptionsForm(read: (key: string) => string, defaults: OptionsDefaults): OptionsResult {
	const trimmed = (key: string): string => punTrim(read(key));
	const flag = (key: string): string => (read(key) === '1' ? '1' : '0');
	const errors: OptionsError[] = [];
	const values = new Map<string, string>();
	const set = (key: string, value: string | number): void => void values.set(`o_${key}`, String(value));

	for (const section of OPTION_SECTIONS) for (const { key, input } of section.fields) if (input.kind === 'yesno') set(key, flag(key));

	const title = trimmed('board_title');
	if (title === '') errors.push('missingTitle');
	set('board_title', title);
	set('board_desc', trimmed('board_desc'));
	const baseUrl = normalizeBaseUrl(trimmed('base_url'));
	if (baseUrl === null) errors.push('invalidBaseUrl');
	set('base_url', baseUrl ?? '');

	const timezone = floatval(read('default_timezone'));
	const style = trimmed('default_style');
	const feedType = intval(read('feed_type'));
	const feedTtl = intval(read('feed_ttl'));
	const reportMethod = intval(read('report_method'));
	const emailSetting = intval(read('default_email_setting'));
	if (
		!(TIMEZONES as readonly number[]).includes(timezone) ||
		!(THEMES as readonly string[]).includes(style) ||
		feedType < 0 ||
		feedType > 2 ||
		feedTtl < 0 ||
		reportMethod < 0 ||
		reportMethod > 2 ||
		emailSetting < 0 ||
		emailSetting > 2
	)
		return { kind: 'badRequest' };
	set('default_timezone', timezone);
	set('default_style', style);
	set('feed_type', feedType);
	set('feed_ttl', feedTtl);
	set('report_method', reportMethod);
	set('default_email_setting', emailSetting);

	const timeoutVisit = atLeast(intval(read('timeout_visit')), 1, 1);
	const timeoutOnline = atLeast(intval(read('timeout_online')), 1, 1);
	if (timeoutOnline >= timeoutVisit) errors.push('timeout');
	set('timeout_visit', timeoutVisit);
	set('timeout_online', timeoutOnline);
	set('redirect_delay', atLeast(intval(read('redirect_delay')), 0, 0));
	set('topic_review', atLeast(intval(read('topic_review')), 0, 0));
	set('disp_topics_default', clamp(intval(read('disp_topics_default')), 3, 75));
	set('disp_posts_default', clamp(intval(read('disp_posts_default')), 3, 75));
	set('indent_num_spaces', atLeast(intval(read('indent_num_spaces')), 0, 0));
	set('quote_depth', atLeast(intval(read('quote_depth')), 1, 1));

	const navlinks = trimmed('additional_navlinks');
	set('additional_navlinks', navlinks !== '' ? punTrim(punLinebreaks(navlinks)) : '');
	const mailingList = trimmed('mailing_list');
	set('mailing_list', mailingList.replace(/\s/g, '').toLowerCase());

	const avatarsDir = trimmed('avatars_dir');
	set('avatars_dir', avatarsDir.endsWith('/') ? avatarsDir.slice(0, -1) : avatarsDir);
	set('avatars_width', atLeast(intval(read('avatars_width')), 1, 1));
	set('avatars_height', atLeast(intval(read('avatars_height')), 1, 1));
	set('avatars_size', atLeast(intval(read('avatars_size')), 1, 1));

	const adminEmail = trimmed('admin_email').toLowerCase();
	const webmasterEmail = trimmed('webmaster_email').toLowerCase();
	if (!isValidEmail(adminEmail)) errors.push('invalidAdminEmail');
	if (!isValidEmail(webmasterEmail)) errors.push('invalidWebmasterEmail');
	set('admin_email', adminEmail);
	set('webmaster_email', webmasterEmail);
	set('smtp_host', trimmed('smtp_host'));
	set('smtp_user', trimmed('smtp_user'));
	if (read('smtp_change_pass') !== '') {
		const pass = trimmed('smtp_pass1');
		if (pass !== trimmed('smtp_pass2')) errors.push('smtpMismatch');
		set('smtp_pass', pass);
	}

	// Message vide : texte par défaut et option désactivée.
	for (const [flagKey, messageKey, fallback] of [
		['announcement', 'announcement_message', defaults.announcement],
		['rules', 'rules_message', defaults.rules],
		['maintenance', 'maintenance_message', defaults.maintenance],
	] as const) {
		const message = trimmed(messageKey);
		if (message !== '') set(messageKey, punLinebreaks(message));
		else {
			set(messageKey, fallback);
			set(flagKey, '0');
		}
	}

	return errors.length > 0 ? { kind: 'invalid', errors } : { kind: 'ok', values };
}

/** Permissions (admin_permissions.php, clés p_*), dans l'ordre du formulaire PHP. */
export const PERMISSION_SECTIONS: readonly OptionSection<'posting' | 'signatures' | 'registration'>[] = [
	{ id: 'posting', fields: flags('message_bbcode', 'message_img_tag', 'message_all_caps', 'subject_all_caps', 'force_guest_email') },
	{
		id: 'signatures',
		fields: [...flags('sig_bbcode', 'sig_img_tag', 'sig_all_caps'), field('sig_length', num(0)), field('sig_lines', num(0, 999))],
	},
	{ id: 'registration', fields: flags('allow_banned_email', 'allow_dupe_email') },
];

/** Formulaire d'admin_permissions.php : intval() de chaque champ, jamais négatif. */
export function readPermissionsForm(read: (key: string) => string): Map<string, string> {
	const values = new Map<string, string>();
	for (const section of PERMISSION_SECTIONS)
		for (const { key } of section.fields) values.set(`p_${key}`, String(Math.max(0, intval(read(key)))));
	return values;
}

/** Clés connues de la table dont la valeur change ; une chaîne vide est enregistrée en NULL. */
export function changedOptions(current: ReadonlyMap<string, string>, values: ReadonlyMap<string, string>): Map<string, string | null> {
	const changes = new Map<string, string | null>();
	for (const [name, value] of values) {
		const before = current.get(name);
		if (before !== undefined && before !== value) changes.set(name, value === '' ? null : value);
	}
	return changes;
}
