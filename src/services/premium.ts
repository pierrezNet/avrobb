/**
 * Règles du compte Premium de PV (premium.php) : état d'après la date d'expiration, durée d'un
 * code d'activation, nouvelle date d'expiration. Fonctions pures ; les dates sont des jours
 * calendaires « AAAA-MM-JJ » (colonne DATE), calculés en UTC.
 *
 * Écart assumé : un code prolonge un compte encore actif à partir de son expiration (le PHP
 * repartait de la date du jour, faisant perdre les jours restants).
 */

/** Date d'expiration qui signifie « à vie » (soutien Tipeee). */
export const LIFETIME_EXPIRATION = '2036-01-01';

export type PremiumState = 'active' | 'lifetime' | 'inactive';

/** Jour calendaire d'un horodatage Unix. */
export function dayOf(timestamp: number): string {
	return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

/** État du compte : actif tant que l'instant présent précède le début du jour d'expiration. */
export function premiumState(expiration: string | null, now: number): PremiumState {
	if (expiration === LIFETIME_EXPIRATION) return 'lifetime';
	if (expiration === null) return 'inactive';
	return now < Date.parse(`${expiration}T00:00:00Z`) / 1000 ? 'active' : 'inactive';
}

/** Table et durée d'un code : « PV15… » 15 jours, « PV365… » 365 jours (Search() du PHP) ; sinon null. */
export function codeKind(code: string): { table: 'acodes15' | 'acodes365'; days: number } | null {
	if (code.includes('PV365')) return { table: 'acodes365', days: 365 };
	if (code.includes('PV15')) return { table: 'acodes15', days: 15 };
	return null;
}

/** Nouvelle expiration après un code de `days` jours. */
export function extendedExpiration(current: string | null, days: number, now: number): string {
	const today = dayOf(now);
	if (current === LIFETIME_EXPIRATION) return current;
	const start = current !== null && current > today ? current : today;
	const date = new Date(`${start}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}
