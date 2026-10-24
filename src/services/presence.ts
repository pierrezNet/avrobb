/**
 * Liste des présents (table online) : décisions de check_cookie(), set_default_user() et
 * update_users_online(), sans accès à la base.
 */

/** Ligne online du visiteur : arrivée (logged) et inactivité (idle). */
export interface Presence {
	logged: number;
	idle: boolean;
}

/** Présence d'un invité, avec la date de son dernier message (anti-flood de post.php). */
export interface GuestPresence extends Presence {
	lastPost: number | null;
}

export type PresenceUpdate =
	| { kind: 'enter' }
	/** Visite qui continue ; `lastVisit` si la visite précédente avait expiré sans être purgée. */
	| { kind: 'refresh'; lastVisit: number | null };

/** Que faire de la présence d'un membre à cette requête (check_cookie()). */
export function memberPresenceUpdate(presence: Presence | null, now: number, timeoutVisit: number): PresenceUpdate {
	if (presence === null) return { kind: 'enter' };
	return { kind: 'refresh', lastVisit: presence.logged < now - timeoutVisit ? presence.logged : null };
}

export interface OnlineEntry {
	userId: number;
	ident: string;
	logged: number;
	idle: boolean;
}

export interface OnlinePurge {
	/** Invités partis (par ident = adresse IP). */
	removeGuests: string[];
	/** Membres dont la visite est terminée : last_visit = logged, puis suppression. */
	endVisits: { userId: number; logged: number }[];
	/** Membres inactifs depuis o_timeout_online : idle = 1. */
	markIdle: number[];
}

/** update_users_online() : sort des entrées plus anciennes que o_timeout_online. */
export function planOnlinePurge(entries: readonly OnlineEntry[], now: number, timeoutOnline: number, timeoutVisit: number): OnlinePurge {
	const purge: OnlinePurge = { removeGuests: [], endVisits: [], markIdle: [] };

	for (const entry of entries) {
		if (entry.logged >= now - timeoutOnline) continue;
		if (entry.userId === 1) purge.removeGuests.push(entry.ident);
		else if (entry.logged < now - timeoutVisit) purge.endVisits.push({ userId: entry.userId, logged: entry.logged });
		else if (!entry.idle) purge.markIdle.push(entry.userId);
	}

	return purge;
}
