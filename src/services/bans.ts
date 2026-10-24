/**
 * Bannissements : check_bans() de include/functions.php, sans accès à la base.
 */

export interface Ban {
	id: number;
	username: string;
	/** Adresses ou préfixes d'adresses séparés par des espaces (« 192.168 10.0.0.1 »). */
	ip: string;
	email: string;
	message: string;
	/** Échéance en secondes Unix, null pour un bannissement permanent. */
	expire: number | null;
}

export interface BanCheck {
	/** Bannissement qui s'applique, ou null. */
	ban: Ban | null;
	/** Bannissements échus rencontrés avant la décision, à supprimer (avec le cache PHP). */
	expiredIds: number[];
}

/**
 * Une adresse est bannie si elle commence par une adresse ou un préfixe de la liste, au point (IPv4)
 * ou aux deux-points (IPv6) près : « 192.168.0.5 » ne couvre pas « 192.168.0.50 ».
 */
function ipMatches(banIps: string, remoteAddress: string): boolean {
	const separator = remoteAddress.includes('.') ? '.' : ':';
	const address = remoteAddress + separator;
	return banIps
		.split(' ')
		.filter((ip) => ip !== '')
		.some((ip) => address.startsWith(ip + separator));
}

/**
 * Parcourt les bannissements dans l'ordre, comme le PHP : les échus sont écartés (et signalés pour
 * suppression) jusqu'au premier qui s'applique au pseudo ou à l'adresse.
 */
export function checkBans(bans: readonly Ban[], username: string, remoteAddress: string, now: number): BanCheck {
	const expiredIds: number[] = [];

	for (const ban of bans) {
		if (ban.expire !== null && ban.expire <= now) {
			expiredIds.push(ban.id);
			continue;
		}

		const byName = ban.username !== '' && ban.username.toLowerCase() === username.toLowerCase();
		if (byName || (ban.ip !== '' && ipMatches(ban.ip, remoteAddress))) return { ban, expiredIds };
	}

	return { ban: null, expiredIds };
}
