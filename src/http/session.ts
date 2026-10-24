/**
 * Début de chaque requête, comme include/common.php : identification par le cookie FluxBB
 * (check_cookie() / set_default_user()), renouvellement du cookie, liste des présents, mode
 * maintenance, bannissements (check_bans()) et purge des présents (update_users_online()).
 *
 * Ces étapes écrivent dans la base partagée exactement ce qu'écrit le PHP, pour que les deux
 * applications voient la même session et la même liste des présents.
 */

import { randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { LegacyCookieConfig } from '../config.ts';
import { type BoardConfig, GroupId, GUEST_USER_ID, type Viewer } from '../domain/models.ts';
import type { BanReader, BanWriter } from '../repositories/BanRepository.ts';
import type { OnlineWriter } from '../repositories/OnlineRepository.ts';
import type { PhpCacheStore } from '../repositories/PhpCacheFiles.ts';
import type { UserReader, ViewerRecord } from '../repositories/UserRepository.ts';
import { checkBans } from '../services/bans.ts';
import {
	buildLegacyCookie,
	cookieMaxAge,
	GUEST_COOKIE_SECONDS,
	isCookiePasswordValid,
	isCookieSignatureValid,
	parseLegacyCookie,
	punHash,
	renewedExpiry,
} from '../services/legacySession.ts';
import { isAnyModerator } from '../services/permissions.ts';
import { memberPresenceUpdate, planOnlinePurge } from '../services/presence.ts';

export interface SessionDeps {
	users: UserReader;
	online: OnlineWriter;
	bans: BanReader & BanWriter;
	/** Pour invalider cache_bans.php quand des bannissements échus sont supprimés ; null sans PHP. */
	phpCache: PhpCacheStore | null;
	legacyCookie: LegacyCookieConfig;
}

export interface SessionOptions {
	/** PUN_QUIET_VISIT (extern.php, login.php?action=…) : la visite ne met pas à jour la présence du membre. */
	quiet: boolean;
}

/** Ce qu'une requête doit montrer au lieu de la page demandée. */
export type SessionBlock = { kind: 'maintenance' } | { kind: 'banned'; expire: number | null; message: string };

/** Pose un cookie au format de forum_setcookie() (HttpOnly, chemin et domaine du PHP). */
export function setForumCookie(
	reply: FastifyReply,
	cookie: LegacyCookieConfig,
	name: string,
	value: string,
	expires: number,
	now: number,
	timeoutVisit: number,
): void {
	const maxAge = cookieMaxAge(expires, now, timeoutVisit);
	reply.setCookie(name, value, {
		path: cookie.path,
		httpOnly: true,
		secure: cookie.secure,
		sameSite: 'lax',
		...(cookie.domain !== '' ? { domain: cookie.domain } : {}),
		...(maxAge !== null ? { maxAge } : {}),
	});
}

/** pun_setcookie() */
export function setSessionCookie(
	reply: FastifyReply,
	deps: Pick<SessionDeps, 'legacyCookie'>,
	userId: number,
	passwordHash: string,
	expires: number,
	now: number,
	timeoutVisit: number,
): void {
	const value = buildLegacyCookie(userId, passwordHash, expires, deps.legacyCookie.seed);
	setForumCookie(reply, deps.legacyCookie, deps.legacyCookie.name, value, expires, now, timeoutVisit);
}

/** Cookie invité posé après un cookie refusé, comme check_cookie() (hash aléatoire, un an). */
function setGuestCookie(reply: FastifyReply, deps: SessionDeps, now: number, timeoutVisit: number): void {
	setSessionCookie(reply, deps, GUEST_USER_ID, punHash(randomBytes(16).toString('hex')), now + GUEST_COOKIE_SECONDS, now, timeoutVisit);
}

/** set_tracked_topics(null) : vide le cookie de suivi des sujets lus. */
function resetTrackedTopics(reply: FastifyReply, deps: SessionDeps, now: number, timeoutVisit: number): void {
	setForumCookie(reply, deps.legacyCookie, `${deps.legacyCookie.name}_track`, '', now + timeoutVisit, now, timeoutVisit);
}

/** check_cookie() : membre authentifié par son cookie, ou null s'il faut traiter le visiteur en invité. */
async function authenticateMember(
	request: FastifyRequest,
	reply: FastifyReply,
	deps: SessionDeps,
	config: BoardConfig,
	now: number,
): Promise<ViewerRecord | null> {
	const cookie = parseLegacyCookie(request.cookies[deps.legacyCookie.name]);
	if (cookie === null || cookie.userId <= GUEST_USER_ID || cookie.expires <= now) return null;

	const record = isCookieSignatureValid(cookie, deps.legacyCookie.seed, now) ? await deps.users.findViewer(cookie.userId) : null;
	if (record === null || !isCookiePasswordValid(cookie, record.passwordHash, deps.legacyCookie.seed)) {
		// Cookie falsifié ou mot de passe changé : on le remplace par un cookie invité.
		setGuestCookie(reply, deps, now, config.timeoutVisit);
		return null;
	}

	setSessionCookie(
		reply,
		deps,
		record.viewer.id,
		record.passwordHash,
		renewedExpiry(cookie.expires, now, config.timeoutVisit),
		now,
		config.timeoutVisit,
	);
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

	const track = request.cookies[`${deps.legacyCookie.name}_track`];
	if (track !== undefined)
		setForumCookie(reply, deps.legacyCookie, `${deps.legacyCookie.name}_track`, track, now + config.timeoutVisit, now, config.timeoutVisit);

	return { ...viewer, logged: record.presence?.logged ?? now, lastVisit: update.lastVisit ?? viewer.lastVisit };
}

/** set_default_user() : l'invité, repéré par son adresse IP dans la liste des présents. */
async function trackGuest(request: FastifyRequest, deps: SessionDeps, now: number): Promise<Viewer> {
	const guest = await deps.users.findViewer(GUEST_USER_ID);
	if (guest === null) throw new Error(`Utilisateur invité (id ${GUEST_USER_ID}) absent de la base`);

	const presence = await deps.online.findGuestPresence(request.ip);
	if (presence === null) await deps.online.enter(GUEST_USER_ID, request.ip, now);
	else await deps.online.refreshGuest(request.ip, now);

	return { ...guest.viewer, logged: presence?.logged ?? now };
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
	const record = await authenticateMember(request, reply, deps, config, now);
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
		await deps.phpCache?.invalidate('bans');
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
