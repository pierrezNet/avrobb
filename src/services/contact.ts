/**
 * Règles des formulaires de misc.php : e-mail à un membre et signalement d'un message. Fonctions
 * pures ; erreurs typées dans l'ordre des contrôles du PHP.
 */

import { punLinebreaks, punTrim } from './phpString.ts';
import { MAX_POST_SIZE } from './posting.ts';

/** Taille maximale d'un motif de signalement (colonne TEXT), en octets. */
export const MAX_REASON_BYTES = 65_535;

/**
 * Anti-flood de misc.php : délai restant (secondes) si le dernier envoi est trop récent, sinon
 * null. Un envoi daté dans le futur (horloge changée) ne bloque pas, comme le PHP.
 */
export function floodWait(last: number | null, interval: number, now: number): number | null {
	if (last === null) return null;
	const elapsed = now - last;
	return elapsed < interval && elapsed >= 0 ? interval - elapsed : null;
}

export type EmailError =
	| { kind: 'noSubject' }
	| { kind: 'noMessage' }
	| { kind: 'tooLong' }
	| { kind: 'flood'; interval: number; wait: number };

export interface EmailForm {
	subject: string;
	message: string;
}

/** misc.php?email=… : sujet et message requis, taille, anti-flood. */
export function validateEmail(
	form: EmailForm,
	flood: { last: number | null; interval: number },
	now: number,
): { values: EmailForm; errors: EmailError[] } {
	const values = { subject: punTrim(form.subject), message: punTrim(form.message) };
	const errors: EmailError[] = [];
	if (values.subject === '') errors.push({ kind: 'noSubject' });
	else if (values.message === '') errors.push({ kind: 'noMessage' });
	else if ([...values.message].length > MAX_POST_SIZE) errors.push({ kind: 'tooLong' });
	const wait = floodWait(flood.last, flood.interval, now);
	if (errors.length === 0 && wait !== null) errors.push({ kind: 'flood', interval: flood.interval, wait });
	return { values, errors };
}

export type ReportError = { kind: 'noReason' } | { kind: 'tooLong' } | { kind: 'flood'; interval: number; wait: number };

/** misc.php?report=… : motif requis, taille, anti-flood. */
export function validateReport(
	reasonInput: string,
	flood: { last: number | null; interval: number },
	now: number,
): { reason: string; errors: ReportError[] } {
	const reason = punLinebreaks(punTrim(reasonInput));
	const errors: ReportError[] = [];
	if (reason === '') errors.push({ kind: 'noReason' });
	else if (Buffer.byteLength(reason, 'utf8') > MAX_REASON_BYTES) errors.push({ kind: 'tooLong' });
	const wait = floodWait(flood.last, flood.interval, now);
	if (errors.length === 0 && wait !== null) errors.push({ kind: 'flood', interval: flood.interval, wait });
	return { reason, errors };
}

/** Formulaire d'e-mail ouvert : pas si le membre l'a désactivé, sauf pour un modérateur. */
export function canEmailMember(recipient: { emailSetting: number }, isAnyModerator: boolean): boolean {
	return recipient.emailSetting !== 2 || isAnyModerator;
}
