/**
 * Règles des formulaires des plugins d'administration (plugins/AP_*.php), en fonctions pures : valeurs
 * par défaut et bornes reprises du PHP.
 */

/** Champ du formulaire (chaîne vide si absent). */
type Read = (name: string) => string;

/** Entier saisi (parseInt de PHP), ou `fallback` s'il n'y en a pas. */
function integer(value: string, fallback: number): number {
	const parsed = Number.parseInt(value.trim(), 10);
	return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * AP_Private_messaging.php : options de la messagerie. Le PHP enregistre le nombre de destinataires
 * plus un (l'expéditeur compte parmi eux) ; l'affichage retire ce un.
 */
export function readPrivateMessageSettings(read: Read): Map<string, string> {
	return new Map([
		['o_pms_enabled', read('form[pms_enabled]') === '1' ? '1' : '0'],
		['o_pms_notification', read('form[pms_notification]') === '1' ? '1' : '0'],
		['o_pms_max_receiver', String(Math.max(0, integer(read('form[pms_max_receiver]'), 0)) + 1)],
	]);
}

/** Droits d'un groupe envoyés (allow[<id>], limit[<id>]) ; null si le groupe n'est pas dans le formulaire. */
export function readGroupPrivateMessageRights(read: Read, groupId: number): { allowed: boolean; limit: number } | null {
	const allowed = read(`allow[${groupId}]`);
	const limit = read(`limit[${groupId}]`);
	if (allowed === '' && limit === '') return null;
	return { allowed: allowed === '1', limit: Math.max(0, integer(limit, 0)) };
}
