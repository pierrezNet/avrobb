/**
 * E-mails envoyés après un nouveau message (post.php) : notification des abonnés au sujet ou au
 * forum (version courte ou avec le texte, selon notify_with_post), et alerte à la liste
 * d'administration quand un invité écrit avec une adresse bannie. Fonctions pures.
 *
 * Écart assumé : les modèles sont ceux du français pour tous les abonnés (le PHP choisissait la
 * langue de chacun ; PV n'en propose qu'une).
 */

import type { Subscriber } from '../domain/models.ts';
import { fillTemplate, type MailMessage, type MailTemplate } from './mail.ts';
import { absoluteUrl, postPath, topicPath } from './routes.ts';

export interface NotificationTemplates {
	short: MailTemplate;
	full: MailTemplate;
}

/** Un e-mail par abonné, modèle complet (<message>) pour ceux qui l'ont demandé. */
export function notifySubscribers(
	subscribers: readonly Subscriber[],
	templates: NotificationTemplates,
	values: Readonly<Record<string, string>>,
): MailMessage[] {
	return subscribers.map((subscriber) => {
		const template = subscriber.notifyWithPost ? templates.full : templates.short;
		return { to: subscriber.email, subject: fillTemplate(template.subject, values), text: fillTemplate(template.body, values) };
	});
}

export interface PostLinks {
	baseUrl: string;
	boardTitle: string;
}

/** Valeurs de new_reply.tpl et new_reply_full.tpl. */
export function replyValues(
	links: PostLinks,
	reply: { topicId: number; topicSubject: string; postId: number; replier: string; message: string },
): Record<string, string> {
	return {
		topic_subject: reply.topicSubject,
		replier: reply.replier,
		message: reply.message,
		post_url: absoluteUrl(links.baseUrl, postPath(reply.postId)),
		unsubscribe_url: absoluteUrl(links.baseUrl, `misc.php?action=unsubscribe&tid=${reply.topicId}`),
		board_mailer: links.boardTitle,
	};
}

/** Valeurs de new_topic.tpl et new_topic_full.tpl. */
export function topicValues(
	links: PostLinks,
	topic: { forumId: number; forumName: string; topicId: number; subject: string; poster: string; message: string },
): Record<string, string> {
	return {
		forum_name: topic.forumName,
		topic_subject: topic.subject,
		poster: topic.poster,
		message: topic.message,
		topic_url: absoluteUrl(links.baseUrl, topicPath(topic.topicId, topic.subject)),
		unsubscribe_url: absoluteUrl(links.baseUrl, `misc.php?action=unsubscribe&fid=${topic.forumId}`),
		board_mailer: links.boardTitle,
	};
}

/** banned_email_post.tpl, pour la liste d'administration (o_mailing_list). */
export function bannedEmailAlert(
	template: MailTemplate,
	to: string,
	links: PostLinks,
	post: { username: string; email: string; postId: number },
): MailMessage {
	return {
		to,
		subject: template.subject,
		text: fillTemplate(template.body, {
			username: post.username,
			email: post.email,
			post_url: absoluteUrl(links.baseUrl, postPath(post.postId)),
			board_mailer: links.boardTitle,
		}),
	};
}
