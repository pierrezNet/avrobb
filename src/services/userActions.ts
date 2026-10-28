/**
 * Actions groupées d'admin_users.php : comptes sélectionnés (cases users[<id>] ou liste « 1,2,3 »
 * reportée d'une étape à l'autre) et date d'expiration d'un bannissement.
 */

type Fields = Readonly<Record<string, string | readonly string[]>>;

/** Identifiants sélectionnés, sans 0 ni 1 (l'invité), comme array_diff($user_ids, array(0, 1)). */
export function readUserIds(fields: Fields): number[] {
	const ids = new Set<number>();
	for (const name of Object.keys(fields)) {
		const match = /^users\[(\d{1,10})\]$/.exec(name);
		if (match?.[1] !== undefined) ids.add(Number(match[1]));
	}
	const list = fields.users;
	if (typeof list === 'string') for (const part of list.split(',')) ids.add(Number.parseInt(part, 10));
	return [...ids].filter((id) => Number.isSafeInteger(id) && id > 1);
}

/**
 * Expiration saisie (aaaa-mm-jj) : strtotime($date.' GMT') ramené au fuseau du lecteur, et dans le
 * futur. null : pas d'expiration (vide ou « Never ») ; 'invalid' sinon.
 */
export function parseBanExpire(value: string, viewerOffsetSeconds: number, now: number): number | null | 'invalid' {
	const trimmed = value.trim();
	if (trimmed === '' || trimmed === 'Never') return null;
	const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
	if (match === null) return 'invalid';
	const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
	const utc = Date.UTC(year, month - 1, day);
	const date = new Date(utc);
	if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return 'invalid';
	const expire = utc / 1000 - viewerOffsetSeconds;
	return expire > now ? expire : 'invalid';
}
