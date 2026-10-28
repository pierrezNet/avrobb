/**
 * Modèle de vue des formulaires de réglages de l'administration (admin_options.php : clés o_*,
 * admin_permissions.php : clés p_*) : sections et champs dans l'ordre du formulaire PHP, avec leurs
 * valeurs (table config, ou saisie à corriger) et leurs choix. Fonction pure.
 */

import type { Lang } from '../lang/fr/index.ts';
import { FEED_TTLS, LANGUAGES, type OptionChoices, type OptionInput, type OptionSection } from '../services/adminOptions.ts';
import { TIMEZONES } from '../services/registration.ts';
import { THEMES } from '../services/themes.ts';

export interface OptionChoiceView {
	value: string;
	label: string;
	selected: boolean;
}

export type OptionControlView =
	| { kind: 'text'; type: 'text' | 'email' | 'url'; maxLength: number; value: string }
	| { kind: 'number'; min: number; max: number; value: string }
	| { kind: 'textarea'; rows: number; value: string }
	| { kind: 'yesno'; checked: boolean }
	| { kind: 'select' | 'radio'; choices: OptionChoiceView[] }
	| { kind: 'smtpPass' };

export interface OptionFieldView {
	/** Nom du champ : form[<key>]. */
	key: string;
	label: string;
	help: string | null;
	control: OptionControlView;
}

export interface AdminOptionsView {
	title: string;
	formAction: string;
	sections: { id: string; legend: string; fields: OptionFieldView[] }[];
	errors: readonly string[];
	notice: string | null;
}

function choiceList(choices: OptionChoices, current: string, lang: Lang): OptionChoiceView[] {
	const t = lang.adminOptions;
	const list = (entries: readonly (readonly [string, string])[]): OptionChoiceView[] =>
		entries.map(([value, label]) => ({ value, label, selected: value === current }));
	switch (choices) {
		case 'timezones':
			return list(TIMEZONES.map((zone) => [String(zone), lang.register.timezones[String(zone)] ?? String(zone)] as const));
		case 'languages':
			// Une valeur inconnue (paquet de langue retiré) reste affichée pour ne pas être perdue en silence.
			return list(
				[...LANGUAGES, ...((LANGUAGES as readonly string[]).includes(current) ? [] : [current])].map(
					(name) => [name, name.replaceAll('_', ' ')] as const,
				),
			);
		case 'styles':
			return list(THEMES.map((name) => [name, name] as const));
		case 'feedTypes':
			return list(t.feedTypes.map((label, index) => [String(index), label] as const));
		case 'feedTtls':
			return list(FEED_TTLS.map((minutes) => [String(minutes), minutes === 0 ? t.feedTtlNone : t.feedTtlMinutes(minutes)] as const));
		case 'reportMethods':
			return list(t.reportMethods.map((label, index) => [String(index), label] as const));
		case 'emailSettings':
			return list(t.emailSettings.map((label, index) => [String(index), label] as const));
	}
}

function fieldControl(input: OptionInput, value: string, lang: Lang): OptionControlView {
	switch (input.kind) {
		case 'text':
		case 'number':
		case 'textarea':
			return { ...input, value };
		case 'yesno':
			return { kind: 'yesno', checked: value === '1' };
		case 'select':
		case 'radio':
			return { kind: input.kind, choices: choiceList(input.choices, value, lang) };
		case 'smtpPass':
			return { kind: 'smtpPass' };
	}
}

export interface SettingsTexts {
	title: string;
	sections: Readonly<Record<string, string>>;
	fields: Readonly<Record<string, { label: string; help: string | null }>>;
}

/**
 * @param prefix préfixe des clés de config (o_ ou p_)
 * @param values valeurs par clé de config : la table, ou la saisie réaffichée après une erreur
 */
export function buildAdminOptions(input: {
	sections: readonly OptionSection[];
	prefix: 'o_' | 'p_';
	texts: SettingsTexts;
	formAction: string;
	values: ReadonlyMap<string, string>;
	errors: readonly string[];
	notice: string | null;
	lang: Lang;
}): AdminOptionsView {
	const t = input.lang.adminOptions;
	const value = (key: string): string => input.values.get(`${input.prefix}${key}`) ?? '';
	return {
		title: input.texts.title,
		formAction: input.formAction,
		sections: input.sections.map((section) => ({
			id: section.id,
			legend: input.texts.sections[section.id] ?? section.id,
			fields: section.fields.map(({ key, input: control }): OptionFieldView => {
				const texts = input.texts.fields[key] ?? { label: key, help: null };
				const help = key === 'time_format' || key === 'date_format' ? t.timeFormatHelp(value(key)) : texts.help;
				return { key, label: texts.label, help, control: fieldControl(control, value(key), input.lang) };
			}),
		})),
		errors: input.errors,
		notice: input.notice,
	};
}
