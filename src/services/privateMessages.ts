/**
 * Règles de la messagerie privée de PV (mod APMS : pms_send.php, pms_view.php, pms_inbox.php) :
 * liste des participants, validation d'un envoi, droits sur un message. Fonctions pures ; les
 * données (destinataires, boîtes) sont lues par le contrôleur.
 *
 * Écarts assumés :
 * - une réponse va aux participants qui détiennent encore la conversation, lus en base (le PHP
 *   prenait la liste d'un champ caché du formulaire, modifiable, et créait des exemplaires
 *   orphelins chez ceux qui l'avaient supprimée) ;
 * - sujet ou message tout en capitales ramené en minuscules pour un simple membre (le PHP le
 *   faisait pour les modérateurs, condition inversée par erreur) ;
 * - anti-flood sur users.last_post, que l'envoi met à jour, au lieu d'une session PHP.
 */

import type { PrivateParticipant, PrivateRecipient } from '../domain/models.ts';
import { floodWait } from './flood.ts';
import { isAllUppercase, punLinebreaks, punTrim } from './phpString.ts';
import { MAX_POST_SIZE, MAX_SUBJECT_LENGTH } from './posting.ts';
import { type PreparseError, type PreparseOptions, preparseBbcode } from './preparse.ts';

/** Suffixe ajouté au pseudo d'un participant qui a supprimé la conversation (messages.receiver). */
export const DELETED_SUFFIX = ' Deleted';

/** Participants d'après messages.receiver (« a, b Deleted ») et receiver_id (« 2, 5 »). */
export function parseParticipants(receiver: string, receiverIds: string): PrivateParticipant[] {
	const names = receiver === '' ? [] : receiver.split(', ');
	const ids = receiverIds.split(',').map((id) => Number.parseInt(id.trim(), 10));
	return names.map((name, index) => {
		const deleted = name.endsWith(DELETED_SUFFIX);
		return { id: ids[index] ?? 0, username: deleted ? name.slice(0, -DELETED_SUFFIX.length) : name, deleted };
	});
}

/** Liste « receiver » où ce participant est marqué comme ayant supprimé la conversation. */
export function markParticipantDeleted(receiver: string, username: string): string {
	return receiver
		.split(', ')
		.map((name) => (name === username ? `${name}${DELETED_SUFFIX}` : name))
		.join(', ');
}

/** Pseudos saisis dans « Envoyer à » : séparés par des virgules, sans doublons ni vides. */
export function parseUsernames(input: string): string[] {
	return [
		...new Set(
			input
				.split(',')
				.map((name) => punTrim(name))
				.filter((name) => name !== ''),
		),
	];
}

/** utf8_ucwords(utf8_strtolower()) */
function ucwords(text: string): string {
	return text.toLowerCase().replace(/(^|\s)(\S)/gu, (_match, space: string, letter: string) => space + letter.toUpperCase());
}

export type SendError =
	| { kind: 'flood'; interval: number }
	| { kind: 'senderFull' }
	| { kind: 'noReceiver' }
	| { kind: 'tooManyReceivers'; max: number }
	| { kind: 'noUser'; username: string }
	| { kind: 'userDisabled'; username: string }
	| { kind: 'receiverFull'; username: string }
	| { kind: 'noSubject' }
	| { kind: 'tooLongSubject' }
	| { kind: 'noMessage' }
	| { kind: 'tooLongMessage' }
	| { kind: 'bbcode'; error: PreparseError };

export interface SendInput {
	/** Pseudos demandés (nouvelle conversation) ; pour une réponse, les participants lus en base. */
	usernames: readonly string[];
	/** Destinataires trouvés en base, expéditeur compris. */
	recipients: readonly PrivateRecipient[];
	/** Sujet d'une nouvelle conversation ; null pour une réponse ou une modification. */
	subject: string | null;
	message: string;
	preview: boolean;
}

export interface SendContext {
	sender: { id: number; username: string; isModerator: boolean; privateMessageLimit: number; privateMessageCount: number };
	lastPost: number | null;
	postFlood: number;
	now: number;
	/** o_pms_max_receiver : nombre maximal de participants, expéditeur compris. */
	maxReceivers: number;
	/** Une modification ne vérifie ni les destinataires ni l'anti-flood. */
	editing: boolean;
	bbcode: boolean;
	subjectAllCaps: boolean;
	messageAllCaps: boolean;
	preparse: Omit<PreparseOptions, 'isSignature'>;
}

export interface ValidatedSend {
	errors: SendError[];
	subject: string;
	message: string;
	/** Destinataires retenus, dans l'ordre saisi, expéditeur compris. */
	recipients: PrivateRecipient[];
}

/** Contrôles d'un destinataire (pms_send.php), dans l'ordre du PHP ; aussi pour les mentions. */
export function recipientError(recipient: PrivateRecipient): SendError | null {
	const { username } = recipient;
	if (!recipient.usesPrivateMessages || !recipient.groupCanUsePrivateMessages) return { kind: 'userDisabled', username };
	// g_id > PUN_GUEST : les boîtes des administrateurs et modérateurs ne sont jamais pleines.
	if (recipient.groupId > 3 && recipient.privateMessageLimit !== 0 && recipient.privateMessageCount >= recipient.privateMessageLimit)
		return { kind: 'receiverFull', username };
	return null;
}

export function validateSend(input: SendInput, context: SendContext): ValidatedSend {
	const errors: SendError[] = [];
	const { sender } = context;

	if (!context.editing && !input.preview) {
		if (floodWait(context.lastPost, context.postFlood, context.now) !== null) errors.push({ kind: 'flood', interval: context.postFlood });
	}
	if (
		!context.editing &&
		sender.privateMessageLimit !== 0 &&
		!sender.isModerator &&
		sender.privateMessageCount >= sender.privateMessageLimit
	)
		errors.push({ kind: 'senderFull' });

	const recipients: PrivateRecipient[] = [];
	if (!context.editing) {
		// L'expéditeur fait toujours partie de la conversation.
		const wanted = parseUsernames([...input.usernames, sender.username].join(','));
		const lower = (name: string): string => name.toLowerCase();
		if (wanted.length < 1) errors.push({ kind: 'noReceiver' });
		else if (wanted.length > context.maxReceivers) errors.push({ kind: 'tooManyReceivers', max: context.maxReceivers - 1 });

		for (const username of wanted) {
			const recipient = input.recipients.find((candidate) => lower(candidate.username) === lower(username));
			if (recipient === undefined) {
				errors.push({ kind: 'noUser', username });
				continue;
			}
			if (recipients.some((already) => already.id === recipient.id)) continue;
			recipients.push(recipient);
			const error = recipientError(recipient);
			if (error !== null) errors.push(error);
		}
	}

	let subject = input.subject !== null ? punTrim(input.subject) : '';
	if (input.subject !== null) {
		if (subject === '') errors.push({ kind: 'noSubject' });
		else if ([...subject].length > MAX_SUBJECT_LENGTH) errors.push({ kind: 'tooLongSubject' });
		else if (!context.subjectAllCaps && isAllUppercase(subject) && !sender.isModerator) subject = ucwords(subject);
	}

	let message = punLinebreaks(punTrim(input.message));
	if (message === '') errors.push({ kind: 'noMessage' });
	else if (Buffer.byteLength(message, 'utf8') > MAX_POST_SIZE) errors.push({ kind: 'tooLongMessage' });
	else if (!context.messageAllCaps && isAllUppercase(message) && !sender.isModerator) message = ucwords(message);

	if (context.bbcode && message !== '') {
		const result = preparseBbcode(message, { ...context.preparse, isSignature: false }, errors.length > 0);
		errors.push(...result.errors.map((error): SendError => ({ kind: 'bbcode', error })));
		if (result.errors.length === 0) message = result.text;
	}

	return { errors, subject, message, recipients };
}

/** Modifier un message : son auteur, ou un administrateur ou modérateur qui détient la conversation. */
export function canEditPrivateMessage(viewer: { id: number; isModerator: boolean }, message: { senderId: number }): boolean {
	return message.senderId === viewer.id || viewer.isModerator;
}

/** Supprimer un message de la conversation pour tous : réservé aux administrateurs et modérateurs. */
export function canDeleteForEverybody(viewer: { isModerator: boolean }): boolean {
	return viewer.isModerator;
}
