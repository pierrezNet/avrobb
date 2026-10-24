/**
 * Validation des paramètres de requête communs à tous les contrôleurs.
 */

/** Identifiant ou numéro strictement positif (intval() de PHP sur une entrée utilisateur) ; 0 si invalide. */
export function positiveInt(value: string | undefined): number {
	if (value === undefined || !/^\s*\d+/.test(value)) return 0;

	const n = Number.parseInt(value, 10);
	return Number.isSafeInteger(n) && n > 0 ? n : 0;
}
