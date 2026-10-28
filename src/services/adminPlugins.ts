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

/** AP_Sondage.php : poll_max_fields = intval(trim()). */
export function readPollMaxOptions(value: string): string {
	return String(integer(value, 0));
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

/** Clés de config de Plugile et leurs valeurs à l'installation. */
export const PLUGILE_DEFAULTS: ReadonlyMap<string, string> = new Map([
	['o_plugile_version', '2.0'],
	['o_plugile_menu', '1'],
	['o_plugile_menu_name', 'Plugile'],
]);

/** Inverse de pun_htmlspecialchars() : le titre Plugile est stocké échappé, il est réaffiché tel que saisi. */
export function unescapeHtml(text: string): string {
	const entities: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"' };
	return text.replace(/&(amp|lt|gt|quot|#0?39);/g, (_, entity: string) => entities[entity] ?? "'");
}

/** Réglages d'Uploadile à l'installation du plugin. */
export const UPLOADILE_DEFAULTS = {
	o_uploadile_laws: 'jpg,jpeg,png,gif,swf,odt,ods,doc,xls,ppt,odp,mp3,pdf',
	o_uploadile_thumb: '1',
	o_uploadile_thumb_size: '100',
	o_uploadile_limit_member: '2097152',
	o_uploadile_limit_modo: '5242880',
	o_uploadile_maxsize_member: '1258291',
	o_uploadile_maxsize_modo: '1258291',
} as const;

/** AP_Uploadile.php (« Mettre à jour ») : une valeur absente ou non positive reprend la valeur par défaut. */
export function readUploadileSettings(read: Read): Map<string, string> {
	const positive = (name: string, key: keyof typeof UPLOADILE_DEFAULTS): string => {
		const value = integer(read(name), 0);
		return value > 0 ? String(value) : UPLOADILE_DEFAULTS[key];
	};
	const laws = read('laws').replaceAll(' ', '');
	return new Map([
		['o_uploadile_laws', laws !== '' ? laws : UPLOADILE_DEFAULTS.o_uploadile_laws],
		['o_uploadile_thumb', read('thumb') === '0' ? '0' : '1'],
		['o_uploadile_thumb_size', positive('thumb_size', 'o_uploadile_thumb_size')],
		['o_uploadile_limit_member', positive('limit_member', 'o_uploadile_limit_member')],
		['o_uploadile_limit_modo', positive('limit_modo', 'o_uploadile_limit_modo')],
		['o_uploadile_maxsize_member', positive('maxsize_member', 'o_uploadile_maxsize_member')],
		['o_uploadile_maxsize_modo', positive('maxsize_modo', 'o_uploadile_maxsize_modo')],
	]);
}
