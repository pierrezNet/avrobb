/**
 * Règles de la renommée (reputation.php, mod Reputation de PV) : accès à la page, droit de voter,
 * raison du vote. Fonctions pures.
 *
 * Écarts assumés : le seuil de messages porte sur le sens du vote (g_rep_plus_min pour un vote
 * positif, g_rep_minus_min pour un négatif ; le PHP, par une affectation au lieu d'une comparaison,
 * exigeait les deux) ; le message visé doit être lisible par le votant ; la colonne
 * reputation_enable_adm, absente du schéma, est ignorée.
 */

import { type BoardConfig, GroupId, type ReputationTarget, type Viewer } from '../domain/models.ts';
import { floodWait } from './flood.ts';
import { isAllUppercase, punLinebreaks, punTrim } from './phpString.ts';
import { type PreparseError, type PreparseOptions, preparseBbcode } from './preparse.ts';

/** Longueur maximale d'une raison, en octets (strlen() du PHP). */
export const MAX_REASON_BYTES = 400;

export type ReputationAccessError = 'groupDisabled' | 'disabled' | 'yourDisabled';

/** Contrôles d'entrée de reputation.php, dans l'ordre du PHP. */
export function reputationAccessError(viewer: Viewer, config: BoardConfig): ReputationAccessError | null {
	if (!viewer.group.canUseReputation) return 'groupDisabled';
	if (!config.reputationEnabled) return 'disabled';
	if (!viewer.reputationEnabled) return 'yourDisabled';
	return null;
}

export type VoteError = 'guest' | 'self' | 'userDisabled' | 'timeout' | 'notEnoughPosts';

/** Peut-on voter pour l'auteur de ce message ? `lastVote` : son dernier vote pour cet auteur. */
export function voteError(
	viewer: Viewer,
	target: Pick<ReputationTarget, 'authorId' | 'authorReputationEnabled'>,
	plus: boolean,
	context: { lastVote: number | null; timeoutMinutes: number; now: number },
): VoteError | null {
	if (viewer.isGuest) return 'guest';
	if (viewer.id === target.authorId) return 'self';
	if (!target.authorReputationEnabled) return 'userDisabled';
	if (floodWait(context.lastVote, context.timeoutMinutes * 60, context.now) !== null) return 'timeout';
	const minimum = plus ? viewer.group.reputationPlusMinPosts : viewer.group.reputationMinusMinPosts;
	if (viewer.numPosts < minimum) return 'notEnoughPosts';
	return null;
}

export type ReasonError = { kind: 'noMessage' } | { kind: 'tooLong' } | { kind: 'bbcode'; error: PreparseError };

/** utf8_ucwords(utf8_strtolower()) */
function ucwords(text: string): string {
	return text.toLowerCase().replace(/(^|\s)(\S)/gu, (_match, space: string, letter: string) => space + letter.toUpperCase());
}

/** Raison du vote : obligatoire, 400 octets au plus, capitales et BBCode traités comme un message. */
export function readReason(
	raw: string,
	context: { bbcode: boolean; messageAllCaps: boolean; preparse: Omit<PreparseOptions, 'isSignature'> },
): { reason: string; errors: ReasonError[] } {
	let reason = punLinebreaks(punTrim(raw));
	if (reason === '') return { reason, errors: [{ kind: 'noMessage' }] };
	if (Buffer.byteLength(reason, 'utf8') > MAX_REASON_BYTES) return { reason, errors: [{ kind: 'tooLong' }] };
	if (!context.messageAllCaps && isAllUppercase(reason)) reason = ucwords(reason);
	if (context.bbcode && reason.includes('[') && reason.includes(']')) {
		const result = preparseBbcode(reason, { ...context.preparse, isSignature: false });
		if (result.errors.length > 0) return { reason, errors: result.errors.map((error): ReasonError => ({ kind: 'bbcode', error })) };
		reason = result.text;
	}
	return { reason, errors: [] };
}

/** Suppression de votes : administrateurs et groupe des modérateurs (g_id 1 et 2, comme le PHP). */
export function canDeleteReputation(viewer: Viewer): boolean {
	return viewer.group.id === GroupId.Admin || viewer.group.id === GroupId.Moderator;
}
