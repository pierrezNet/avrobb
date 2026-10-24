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
