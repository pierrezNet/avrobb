/**
 * Formatage des dates comme format_time() de FluxBB : décalage du fuseau de l'utilisateur
 * (+ heure d'été), « Aujourd'hui » / « Hier », formats de date et d'heure de PHP (o_date_format…).
 */

export interface TimeSettings {
	/** Décalage en heures (users.timezone). */
	timezone: number;
	dst: boolean;
	dateFormat: string;
	timeFormat: string;
}

export interface DateWords {
	today: string;
	yesterday: string;
	never: string;
	days: readonly string[];
	months: readonly string[];
}

/**
 * Formats par défaut de format_time() chez Pilote-Virtuel : la fonction a été modifiée pour
 * prendre « d/m/Y » et « H:i » au lieu de o_date_format / o_time_format (et des préférences du
 * membre), qui ne servent plus que si l'appelant passe explicitement null.
 */
export const PV_DATE_FORMAT = 'd/m/Y';
export const PV_TIME_FORMAT = 'H:i';

/** Réglages d'affichage des dates d'un membre, avec les formats de PV. */
export function viewerTimeSettings(viewer: { timezone: number; dst: boolean }): TimeSettings {
	return { timezone: viewer.timezone, dst: viewer.dst, dateFormat: PV_DATE_FORMAT, timeFormat: PV_TIME_FORMAT };
}

const pad = (n: number): string => String(n).padStart(2, '0');

type DatePart = (date: Date, words: DateWords) => string | number;

const hour12 = (date: Date): number => date.getUTCHours() % 12 || 12;

/** Lettres de date() de PHP reconnues (les autres sont recopiées telles quelles). */
const DATE_PARTS: Readonly<Record<string, DatePart>> = {
	d: (date) => pad(date.getUTCDate()),
	j: (date) => date.getUTCDate(),
	D: (date, words) => (words.days[date.getUTCDay()] ?? '').slice(0, 3),
	l: (date, words) => words.days[date.getUTCDay()] ?? '',
	m: (date) => pad(date.getUTCMonth() + 1),
	n: (date) => date.getUTCMonth() + 1,
	M: (date, words) => (words.months[date.getUTCMonth()] ?? '').slice(0, 3),
	F: (date, words) => words.months[date.getUTCMonth()] ?? '',
	Y: (date) => date.getUTCFullYear(),
	y: (date) => pad(date.getUTCFullYear() % 100),
	H: (date) => pad(date.getUTCHours()),
	G: (date) => date.getUTCHours(),
	h: (date) => pad(hour12(date)),
	g: (date) => hour12(date),
	i: (date) => pad(date.getUTCMinutes()),
	s: (date) => pad(date.getUTCSeconds()),
	a: (date) => (date.getUTCHours() < 12 ? 'am' : 'pm'),
	A: (date) => (date.getUTCHours() < 12 ? 'AM' : 'PM'),
};

/** Sous-ensemble de date() de PHP, appliqué à une Date lue en UTC (décalage déjà ajouté). */
export function phpDate(format: string, date: Date, words: DateWords): string {
	let out = '';

	for (let i = 0; i < format.length; i++) {
		const c = format.charAt(i);

		if (c === '\\') {
			i++;
			out += format.charAt(i);
			continue;
		}

		const part = Object.hasOwn(DATE_PARTS, c) ? DATE_PARTS[c] : undefined;
		out += part !== undefined ? part(date, words) : c;
	}

	return out;
}

/**
 * @param timestamp secondes Unix (null = jamais)
 * @param now secondes Unix de référence pour « Aujourd'hui » / « Hier »
 */
export function formatTime(timestamp: number | null, settings: TimeSettings, words: DateWords, now: number, dateOnly = false): string {
	if (timestamp === null || timestamp === 0) return words.never;

	const offset = (settings.timezone + (settings.dst ? 1 : 0)) * 3600;
	const at = new Date((timestamp + offset) * 1000);
	const day = (seconds: number): string => phpDate('Y-m-d', new Date((seconds + offset) * 1000), words);

	let datePart: string;
	if (day(timestamp) === day(now)) datePart = words.today;
	else if (day(timestamp) === day(now - 86400)) datePart = words.yesterday;
	else datePart = phpDate(settings.dateFormat, at, words);

	return dateOnly ? datePart : `${datePart} ${phpDate(settings.timeFormat, at, words)}`;
}
