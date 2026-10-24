/**
 * Détermine l'utilisateur courant à partir du cookie de session FluxBB (check_cookie()).
 * Lecture seule : contrairement à PHP, le cookie n'est ni prolongé ni réémis ici.
 */

import { GUEST_USER_ID, type Viewer } from '../domain/models.ts';
import type { UserReader } from '../repositories/UserRepository.ts';
import { isCookiePasswordValid, isCookieSignatureValid, parseLegacyCookie } from '../services/legacySession.ts';

export async function resolveViewer(
	cookieValue: string | undefined,
	users: UserReader,
	seed: string,
	now: number,
): Promise<Viewer> {
	const cookie = parseLegacyCookie(cookieValue);

	if (cookie !== null && cookie.userId > GUEST_USER_ID && isCookieSignatureValid(cookie, seed, now)) {
		const record = await users.findViewer(cookie.userId);

		if (record !== null && isCookiePasswordValid(cookie, record.passwordHash, seed))
			return record.viewer;
	}

	const guest = await users.findViewer(GUEST_USER_ID);
	if (guest === null)
		throw new Error(`Utilisateur invité (id ${GUEST_USER_ID}) absent de la base`);

	return guest.viewer;
}
