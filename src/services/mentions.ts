/**
 * Mentions de membres dans un message (« @Nom » inséré par public/js/mentions.js sous la forme
 * [url=<forum>/profile.php?id=N]@Nom[/url]) : membres à prévenir par message privé.
 */

import type { PrivateRecipient } from '../domain/models.ts';
import { recipientError } from './privateMessages.ts';

/** Membres prévenus au plus par message (évite qu'un message serve à écrire à tout le forum). */
export const MAX_MENTIONS = 5;

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** Identifiants des membres mentionnés (sans doublon, dans l'ordre), hors l'auteur, au plus MAX_MENTIONS. */
export function extractMentionIds(message: string, baseUrl: string, authorId: number): number[] {
	const base = baseUrl !== '' ? `(?:${escapeRegExp(baseUrl)})?/?` : '/?';
	const pattern = new RegExp(`\\[url=${base}profile\\.php\\?id=(\\d{1,10})\\]@[^[\\]]{1,25}\\[/url\\]`, 'g');
	const ids: number[] = [];
	for (const match of message.matchAll(pattern)) {
		const id = Number(match[1]);
		if (id > 1 && id !== authorId && !ids.includes(id)) ids.push(id);
		if (ids.length === MAX_MENTIONS) break;
	}
	return ids;
}

/** Destinataires qui peuvent recevoir le message privé (messagerie active, boîte non pleine). */
export function mentionRecipients(recipients: readonly PrivateRecipient[]): PrivateRecipient[] {
	return recipients.filter((recipient) => recipientError(recipient) === null);
}
