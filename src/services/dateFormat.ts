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

const pad = (n: number): string => String(n).padStart(2, '0');

/** Sous-ensemble de date() de PHP, appliqué à une Date lue en UTC (décalage déjà ajouté). */
export function phpDate(format: string, date: Date, words: DateWords): string {
	let out = '';

	for (let i = 0; i < format.length; i++) {
		const c = format[i]!;
		const hours = date.getUTCHours();

		switch (c) {
			case 'd': out += pad(date.getUTCDate()); break;
			case 'j': out += date.getUTCDate(); break;
			case 'D': out += (words.days[date.getUTCDay()] ?? '').slice(0, 3); break;
			case 'l': out += words.days[date.getUTCDay()] ?? ''; break;
			case 'm': out += pad(date.getUTCMonth() + 1); break;
			case 'n': out += date.getUTCMonth() + 1; break;
			case 'M': out += (words.months[date.getUTCMonth()] ?? '').slice(0, 3); break;
			case 'F': out += words.months[date.getUTCMonth()] ?? ''; break;
			case 'Y': out += date.getUTCFullYear(); break;
			case 'y': out += pad(date.getUTCFullYear() % 100); break;
			case 'H': out += pad(hours); break;
			case 'G': out += hours; break;
			case 'h': out += pad(hours % 12 || 12); break;
			case 'g': out += hours % 12 || 12; break;
			case 'i': out += pad(date.getUTCMinutes()); break;
			case 's': out += pad(date.getUTCSeconds()); break;
			case 'a': out += hours < 12 ? 'am' : 'pm'; break;
			case 'A': out += hours < 12 ? 'AM' : 'PM'; break;
			case '\\': out += format[++i] ?? ''; break;
			default: out += c;
		}
	}

	return out;
}

/**
 * @param timestamp secondes Unix (null = jamais)
 * @param now secondes Unix de référence pour « Aujourd'hui » / « Hier »
 */
export function formatTime(
	timestamp: number | null,
	settings: TimeSettings,
	words: DateWords,
	now: number,
	dateOnly = false,
): string {
	if (timestamp === null || timestamp === 0)
		return words.never;

	const offset = (settings.timezone + (settings.dst ? 1 : 0)) * 3600;
	const at = new Date((timestamp + offset) * 1000);
	const day = (seconds: number): string => phpDate('Y-m-d', new Date((seconds + offset) * 1000), words);

	let datePart: string;
	if (day(timestamp) === day(now))
		datePart = words.today;
	else if (day(timestamp) === day(now - 86400))
		datePart = words.yesterday;
	else
		datePart = phpDate(settings.dateFormat, at, words);

	return dateOnly ? datePart : `${datePart} ${phpDate(settings.timeFormat, at, words)}`;
}
