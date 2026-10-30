/**
 * Début de chaque requête, comme include/common.php de FluxBB : identification par le cookie de
 * session (services/session.ts), liste des présents, mode maintenance, bannissements
 * (check_bans()) et purge des présents (update_users_online()).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CookieConfig } from '../config.ts';
import { type BoardConfig, GroupId, GUEST_USER_ID, type Viewer } from '../domain/models.ts';
import type { BanReader, BanWriter } from '../repositories/BanRepository.ts';
import type { OnlineWriter } from '../repositories/OnlineRepository.ts';
import type { UserReader, ViewerRecord } from '../repositories/UserRepository.ts';
import { checkBans } from '../services/bans.ts';
import { isAnyModerator } from '../services/permissions.ts';
import { memberPresenceUpdate, planOnlinePurge } from '../services/presence.ts';
import { buildSessionCookie, cookieMaxAge, readSessionCookie, SESSION_SECONDS, shouldRenewSession } from '../services/session.ts';

export interface SessionDeps {
	users: UserReader;
	online: OnlineWriter;
	bans: BanReader & BanWriter;
	cookie: CookieConfig;
}

export interface SessionOptions {
	/** PUN_QUIET_VISIT (extern.php, login.php?action=…) : la visite ne met pas à jour la présence du membre. */
	quiet: boolean;
}

/** Ce qu'une requête doit montrer au lieu de la page demandée. */
export type SessionBlock = { kind: 'maintenance' } | { kind: 'banned'; expire: number | null; message: string };

export function sessionCookieName(cookie: CookieConfig): string {
	return `${cookie.name}_session`;
}

export function trackCookieName(cookie: CookieConfig): string {
	return `${cookie.name}_track`;
}

/** Pose un cookie du forum (HttpOnly, SameSite=Lax, chemin /) ; durée de vie comme forum_setcookie(). */
export function setForumCookie(
	reply: FastifyReply,
	cookie: CookieConfig,
	name: string,
	value: string,
	expires: number,
	now: number,
	timeoutVisit: number,
): void {
	const maxAge = cookieMaxAge(expires, now, timeoutVisit);
	reply.setCookie(name, value, {
		path: '/',
		httpOnly: true,
		secure: cookie.secure,
		sameSite: 'lax',
		...(maxAge !== null ? { maxAge } : {}),
	});
}

/** Ouvre (ou prolonge) la session du membre pour SESSION_SECONDS. */
export function setSessionCookie(reply: FastifyReply, deps: Pick<SessionDeps, 'cookie'>, userId: number, now: number): void {
	const expires = now + SESSION_SECONDS;
	reply.setCookie(sessionCookieName(deps.cookie), buildSessionCookie(userId, expires, deps.cookie.secret), {
		path: '/',
		httpOnly: true,
		secure: deps.cookie.secure,
		sameSite: 'lax',
		maxAge: SESSION_SECONDS,
	});
}

export function clearSessionCookie(reply: FastifyReply, deps: Pick<SessionDeps, 'cookie'>): void {
	reply.clearCookie(sessionCookieName(deps.cookie), { path: '/' });
}

/** set_tracked_topics(null) : vide le cookie de suivi des sujets lus. */
function resetTrackedTopics(reply: FastifyReply, deps: SessionDeps, now: number, timeoutVisit: number): void {
	setForumCookie(reply, deps.cookie, trackCookieName(deps.cookie), '', now + timeoutVisit, now, timeoutVisit);
}

/** Membre authentifié par son cookie de session, ou null s'il faut traiter le visiteur en invité. */
async function authenticateMember(
	request: FastifyRequest,
	reply: FastifyReply,
	deps: SessionDeps,
	now: number,
): Promise<ViewerRecord | null> {
	const raw = request.cookies[sessionCookieName(deps.cookie)];
	if (raw === undefined) return null;

	const session = readSessionCookie(raw, deps.cookie.secret, now);
	const record = session !== null && session.userId !== GUEST_USER_ID ? await deps.users.findViewer(session.userId) : null;
	if (session === null || record === null) {
		// Cookie falsifié, échu ou compte supprimé : on l'efface.
		clearSessionCookie(reply, deps);
		return null;
	}

	if (shouldRenewSession(session.expires, now)) setSessionCookie(reply, deps, record.viewer.id, now);
	return record;
}

/** Présence d'un membre (check_cookie()) ; renvoie le début de sa visite et sa dernière visite. */
async function trackMember(
	request: FastifyRequest,
	reply: FastifyReply,
	deps: SessionDeps,
	record: ViewerRecord,
	config: BoardConfig,
	now: number,
	quiet: boolean,
): Promise<Viewer> {
	const { viewer } = record;

	if (quiet) return { ...viewer, logged: record.presence?.logged ?? viewer.lastVisit };

	const update = memberPresenceUpdate(record.presence, now, config.timeoutVisit);
	if (update.kind === 'enter') {
		await deps.online.enter(viewer.id, viewer.username, now);
		resetTrackedTopics(reply, deps, now, config.timeoutVisit);
		return { ...viewer, logged: now };
	}

	if (update.lastVisit !== null) await deps.online.setLastVisit(viewer.id, update.lastVisit);
	await deps.online.refreshMember(viewer.id, now);

	const trackName = trackCookieName(deps.cookie);
	const track = request.cookies[trackName];
	if (track !== undefined) setForumCookie(reply, deps.cookie, trackName, track, now + config.timeoutVisit, now, config.timeoutVisit);

	return { ...viewer, logged: record.presence?.logged ?? now, lastVisit: update.lastVisit ?? viewer.lastVisit };
}

/** set_default_user() : l'invité, repéré par son adresse IP dans la liste des présents. */
async function trackGuest(request: FastifyRequest, deps: SessionDeps, now: number): Promise<Viewer> {
	const guest = await deps.users.findViewer(GUEST_USER_ID);
	if (guest === null) throw new Error(`Utilisateur invité (id ${GUEST_USER_ID}) absent de la base`);

	const presence = await deps.online.findGuestPresence(request.ip);
	if (presence === null) await deps.online.enter(GUEST_USER_ID, request.ip, now);
	else await deps.online.refreshGuest(request.ip, now);

	return {
		...guest.viewer,
		logged: presence?.logged ?? now,
		lastPost: presence?.lastPost ?? null,
		lastSearch: presence?.lastSearch ?? null,
		ban: null,
	};
}

/** Identifie le visiteur et met à jour sa présence ; pose ou renouvelle les cookies. */
export async function startSession(
	request: FastifyRequest,
	reply: FastifyReply,
	deps: SessionDeps,
	config: BoardConfig,
	now: number,
	options: SessionOptions,
): Promise<Viewer> {
	const record = await authenticateMember(request, reply, deps, now);
	return record !== null ? trackMember(request, reply, deps, record, config, now, options.quiet) : trackGuest(request, deps, now);
}

/** Maintenance puis bannissements, dans l'ordre de common.php ; null si la page peut s'afficher. */
export async function checkAccess(
	request: FastifyRequest,
	deps: SessionDeps,
	viewer: Viewer,
	config: BoardConfig,
	now: number,
	allowDuringMaintenance: boolean,
): Promise<SessionBlock | null> {
	if (config.maintenance && viewer.group.id !== GroupId.Admin && !allowDuringMaintenance) return { kind: 'maintenance' };

	// Les administrateurs et modérateurs ne sont pas concernés par les bannissements.
	if (isAnyModerator(viewer)) return null;

	const { ban, expiredIds } = checkBans(await deps.bans.listBans(), viewer.username, request.ip, now);
	if (expiredIds.length > 0) {
		await deps.bans.deleteBans(expiredIds);
	}

	if (ban === null) return null;
	await deps.online.removeIdent(viewer.username);
	return { kind: 'banned', expire: ban.expire, message: ban.message };
}

/** update_users_online() : invités partis, fins de visite (last_visit), membres inactifs. */
export async function purgeOnline(deps: SessionDeps, config: BoardConfig, now: number): Promise<void> {
	const stale = await deps.online.listStale(now - config.timeoutOnline);
	await deps.online.applyPurge(planOnlinePurge(stale, now, config.timeoutOnline, config.timeoutVisit));
}
