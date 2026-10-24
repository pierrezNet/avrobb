/**
 * Anti-flood commun de FluxBB (recherche, e-mail, signalement) : délai minimal du groupe entre deux
 * actions, compté depuis la dernière (search.php, misc.php).
 */

/**
 * Délai restant (secondes) si la dernière action est trop récente, sinon null. Une date dans le
 * futur (horloge changée) ne bloque pas, comme le PHP.
 */
export function floodWait(last: number | null, interval: number, now: number): number | null {
	if (last === null) return null;
	const elapsed = now - last;
	return elapsed < interval && elapsed >= 0 ? interval - elapsed : null;
}
