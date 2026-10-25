/**
 * Formatage des nombres comme le PHP de PV.
 */

/** forum_number_format() : séparateur de milliers « espace » (lang_thousands_sep du français). */
export function forumNumberFormat(n: number): string {
	return Math.trunc(n)
		.toString()
		.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * bd_nice_number() (ajout de PV, compteurs de l'index) : « 12.3 k » au-delà de mille, « 1.2 M » au-delà
 * d'un million, avec le point décimal de round() en PHP ; sinon number_format() (virgule des milliers).
 */
export function niceNumber(n: number): string {
	const round1 = (x: number): string => String(Math.round(x * 10) / 10);
	if (n > 1_000_000) return `${round1(n / 1_000_000)} M`;
	if (n > 1000) return `${round1(n / 1000)} k`;
	return Math.round(n)
		.toString()
		.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const SIZE_UNITS = ['O', 'Kio', 'Mio', 'Gio', 'Tio', 'Pio', 'Eio'] as const;

/** file_size() : taille lisible en unités binaires, arrondie à deux décimales (« 9.77 Kio »). */
export function fileSize(bytes: number): string {
	let size = bytes;
	let unit = 0;
	while (size > 1024 && unit < SIZE_UNITS.length - 1) {
		size /= 1024;
		unit += 1;
	}
	// sprintf('%s') d'un flottant PHP : point décimal, sans zéros inutiles.
	return `${String(Math.round(size * 100) / 100)} ${SIZE_UNITS[unit]}`;
}
