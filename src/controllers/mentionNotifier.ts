/**
 * Prévenir par message privé les membres mentionnés (« @Nom ») dans un nouveau message : seulement
 * ceux qui peuvent lire la discussion et recevoir des messages privés. La conversation ne contient
 * que le membre prévenu (l'auteur n'en garde pas de copie dans sa boîte).
 */

import type { FastifyBaseLogger } from 'fastify';
import type { BoardConfig } from '../domain/models.ts';
import type { PageContext } from '../http/layout.ts';
import type { PrivateMessageStore } from '../repositories/PrivateMessageRepository.ts';
import type { TopicReader } from '../repositories/TopicRepository.ts';
import { extractMentionIds, mentionRecipients } from '../services/mentions.ts';

export interface MentionNotifierDeps {
	privateMessageStore: Pick<PrivateMessageStore, 'findRecipientsById' | 'createConversation'>;
	topics: Pick<TopicReader, 'findReadable'>;
	page: PageContext;
}

export interface MentionInput {
	config: BoardConfig;
	author: { id: number; username: string; ip: string; isModerator: boolean };
	/** Message enregistré (BBCode). */
	message: string;
	topicId: number;
	postId: number;
	/** Sujet de la discussion, censuré. */
	subject: string;
}

/** Envoie les messages privés ; un échec est journalisé sans annuler le message publié. */
export async function notifyMentions(deps: MentionNotifierDeps, input: MentionInput, log: FastifyBaseLogger): Promise<void> {
	const { config, author } = input;
	if (!config.privateMessagesEnabled) return;
	const ids = extractMentionIds(input.message, config.baseUrl, author.id);
	if (ids.length === 0) return;
	const t = deps.page.lang.post;
	try {
		const recipients = mentionRecipients(await deps.privateMessageStore.findRecipientsById(ids, author.id), author.isModerator);
		const link = `[url=${config.baseUrl}/viewtopic.php?pid=${input.postId}#p${input.postId}]${input.subject}[/url]`;
		for (const recipient of recipients) {
			// Discussion illisible pour son groupe (forum réservé) : pas de message, rien ne doit fuiter.
			if ((await deps.topics.findReadable(input.topicId, recipient.groupId)) === null) continue;
			await deps.privateMessageStore.createConversation({
				subject: t.mentionSubject(author.username),
				message: t.mentionMessage(author.username, link),
				hideSmilies: false,
				sender: { id: author.id, username: author.username, ip: author.ip },
				recipients: [recipient],
				now: deps.page.clock(),
			});
		}
	} catch (error) {
		log.error({ err: error }, "Échec de l'envoi d'un message privé de mention");
	}
}
