/**
 * Notifications push : abonnement reçu d'un navigateur (validé) et contenu des notifications.
 */

import type { Locale } from './routes.ts';

export interface PushSubscriptionInput {
	endpoint: string;
	p256dh: string;
	auth: string;
}

/** Notification telle que la lit le service worker (public/sw.js). */
export interface PushMessage {
	title: string;
	body: string;
	/** Adresse du forum (« /sujet/4… »), ouverte au clic. */
	url: string;
	/** Une notification par conversation ou discussion : la suivante la remplace. */
	tag: string;
	lang: Locale;
}

/**
 * Services de push des navigateurs. Le Worker envoie à l'adresse donnée par le navigateur : sans
 * cette liste, un membre pourrait lui faire appeler n'importe quel serveur.
 */
const PUSH_SERVICE_HOSTS = [
	'fcm.googleapis.com',
	'updates.push.services.mozilla.com',
	'push.services.mozilla.com',
	'web.push.apple.com',
	'notify.windows.com',
];

function isKnownPushEndpoint(endpoint: string): boolean {
	try {
		const url = new URL(endpoint);
		return (
			url.protocol === 'https:' &&
			endpoint.length <= 1000 &&
			PUSH_SERVICE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
		);
	} catch {
		return false;
	}
}

const isPushKey = (value: string): boolean => /^[A-Za-z0-9_-]{16,256}$/.test(value);

export function readPushSubscription(fields: { endpoint: string; p256dh: string; auth: string }): PushSubscriptionInput | null {
	const { endpoint, p256dh, auth } = fields;
	return isKnownPushEndpoint(endpoint) && isPushKey(p256dh) && isPushKey(auth) ? { endpoint, p256dh, auth } : null;
}

export interface PushTexts {
	privateMessage: (sender: string) => string;
	reply: (subject: string) => string;
	replyBody: (replier: string) => string;
}

export function privateMessagePush(
	texts: PushTexts,
	locale: Locale,
	message: { sender: string; subject: string; url: string; conversationId: number },
): PushMessage {
	return {
		title: texts.privateMessage(message.sender),
		body: message.subject,
		url: message.url,
		tag: `pm-${message.conversationId}`,
		lang: locale,
	};
}

export function replyPush(
	texts: PushTexts,
	locale: Locale,
	reply: { replier: string; subject: string; url: string; topicId: number },
): PushMessage {
	return {
		title: texts.reply(reply.subject),
		body: texts.replyBody(reply.replier),
		url: reply.url,
		tag: `topic-${reply.topicId}`,
		lang: locale,
	};
}
