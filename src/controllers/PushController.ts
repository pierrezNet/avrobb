/**
 * Abonnement d'un appareil aux notifications push (push.php, appelé par public/assets/js/pwa.js).
 */

import type { AppReply, AppRequest } from '../http/context.ts';
import { type FormBody, field } from '../http/forms.ts';
import type { PageContext } from '../http/layout.ts';
import type { PushDeps } from '../http/push.ts';
import { readPushSubscription } from '../services/push.ts';

export interface PushControllerDeps {
	push: PushDeps | null;
	page: PageContext;
}

export interface PushQuery {
	action?: string;
}

export class PushController {
	constructor(private readonly deps: PushControllerDeps) {}

	submit = async (request: AppRequest<{ Querystring: PushQuery; Body: FormBody }>, reply: AppReply): Promise<AppReply> => {
		const { viewer, body } = request;
		const push = this.deps.push;
		reply.header('Cache-Control', 'no-store');
		if (push === null) return reply.code(404).json({ ok: false });
		if (viewer.isGuest) return reply.code(403).json({ ok: false });

		const endpoint = field(body, 'endpoint');
		if (request.query.action === 'unsubscribe') {
			await push.subscriptions.remove(viewer.id, endpoint);
			return reply.json({ ok: true });
		}
		const subscription = readPushSubscription({ endpoint, p256dh: field(body, 'p256dh'), auth: field(body, 'auth') });
		if (request.query.action !== 'subscribe' || subscription === null) return reply.code(400).json({ ok: false });
		// Langue de la page qui a demandé l'abonnement : celle des notifications de cet appareil.
		await push.subscriptions.save(viewer.id, subscription, this.deps.page.locale, this.deps.page.clock());
		return reply.json({ ok: true });
	};
}
