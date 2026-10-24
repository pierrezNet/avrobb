/**
 * Contrôleur de misc.php pour les règles, « marquer comme lu » et les abonnements aux sujets et
 * forums. Les autres actions (e-mail à un membre, signalement) restent servies par le PHP.
 *
 * Écart assumé : « marquer comme lu » et les abonnements se font par un formulaire POST (jeton
 * CSRF) ; un ancien lien GET (pages PHP, lien de désabonnement des e-mails) affiche une
 * confirmation au lieu d'écrire.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { LegacyCookieConfig } from '../config.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { setForumCookie } from '../http/session.ts';
import type { OnlineWriter } from '../repositories/OnlineRepository.ts';
import type { SubscriptionStore, SubscriptionTarget } from '../repositories/SubscriptionRepository.ts';
import { markRead, parseTrackedTopics, serializeTrackedTopics } from '../services/trackedTopics.ts';
import { positiveInt } from './params.ts';

export interface MiscControllerDeps extends LayoutDeps {
	online: OnlineWriter;
	legacyCookie: LegacyCookieConfig;
	legacyBaseUrl: string;
	trackCookieName: string;
	subscriptions: SubscriptionStore;
}

export interface MiscQuery {
	action?: string;
	fid?: string;
	tid?: string;
}

type MiscRequest = FastifyRequest<{ Querystring: MiscQuery; Body?: FormBody }>;
type SubscriptionAction = 'subscribe' | 'unsubscribe';

const isSubscriptionAction = (action: string | undefined): action is SubscriptionAction =>
	action === 'subscribe' || action === 'unsubscribe';

export class MiscController {
	constructor(private readonly deps: MiscControllerDeps) {}

	show = async (request: FastifyRequest<{ Querystring: MiscQuery }>, reply: FastifyReply): Promise<FastifyReply> => {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		const { action } = request.query;

		if (action === 'rules') {
			if (!config.rules || (viewer.isGuest && !viewer.group.canReadBoard && !config.registrationsAllowed))
				return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
			return renderPage(
				request,
				reply,
				this.deps,
				'rules.njk',
				{ pageId: 'misc', titleParts: [config.boardTitle, lang.misc.forumRules], activeNav: 'rules' },
				{ rulesHtml: config.rulesMessage },
			);
		}

		if (action === 'markread' || action === 'markforumread') {
			if (viewer.isGuest) return renderMessage(request, reply, this.deps, 403, lang.common.noPermission);
			const forumId = positiveInt(request.query.fid);
			if (action === 'markforumread' && forumId === 0) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);

			return renderPage(
				request,
				reply,
				this.deps,
				'mark_read.njk',
				{ pageId: 'misc', titleParts: [config.boardTitle, action === 'markread' ? lang.misc.markRead : lang.misc.markForumRead] },
				{
					action: action === 'markread' ? 'misc.php?action=markread' : `misc.php?action=markforumread&fid=${forumId}`,
					forumWide: action === 'markforumread',
				},
			);
		}

		if (isSubscriptionAction(action)) {
			const target = await this.subscriptionTarget(request, reply, action);
			if (!('kind' in target)) return target;
			const t = lang.misc;
			const topic = target.kind === 'topic';
			const title = action === 'unsubscribe' ? t.unsubscribe : topic ? t.subscribeTopic : t.subscribeForum;
			const text =
				action === 'subscribe'
					? topic
						? t.confirmSubscribeTopic
						: t.confirmSubscribeForum
					: topic
						? t.confirmUnsubscribeTopic
						: t.confirmUnsubscribeForum;
			return renderPage(
				request,
				reply,
				this.deps,
				'confirm.njk',
				{ pageId: 'misc', titleParts: [config.boardTitle, title] },
				{
					title,
					text,
					action: `misc.php?action=${action}&${topic ? 'tid' : 'fid'}=${target.id}`,
					button: t.confirm,
				},
			);
		}

		// E-mail à un membre, signalement : encore servis par le PHP.
		if (this.deps.legacyBaseUrl !== '') {
			const search = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
			return reply.redirect(`${this.deps.legacyBaseUrl}/misc.php${search}`);
		}
		return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
	};

	/** POST misc.php?action=subscribe|unsubscribe&tid=…|fid=… (jeton CSRF vérifié en amont). */
	subscription = async (
		request: FastifyRequest<{ Querystring: MiscQuery; Body: FormBody }>,
		reply: FastifyReply,
	): Promise<FastifyReply> => {
		const { action } = request.query;
		if (!isSubscriptionAction(action)) return renderMessage(request, reply, this.deps, 400, this.deps.page.lang.common.badRequest);
		const target = await this.subscriptionTarget(request, reply, action);
		if (!('kind' in target)) return target;

		if (action === 'subscribe') await this.deps.subscriptions.subscribe(target, request.viewer.id);
		else await this.deps.subscriptions.unsubscribe(target, request.viewer.id);
		return reply.redirect(target.kind === 'topic' ? `viewtopic.php?id=${target.id}` : `viewforum.php?id=${target.id}`, 303);
	};

	/**
	 * Contrôles de misc.php, dans son ordre : membre, sujet ou forum indiqué, abonnements activés,
	 * cible lisible (pour s'abonner), état de l'abonnement.
	 */
	private async subscriptionTarget(
		request: MiscRequest,
		reply: FastifyReply,
		action: SubscriptionAction,
	): Promise<SubscriptionTarget | FastifyReply> {
		const { viewer, board: config } = request;
		const t = this.deps.page.lang;
		if (viewer.isGuest) return renderMessage(request, reply, this.deps, 403, t.common.noPermission);

		const topicId = positiveInt(request.query.tid);
		const forumId = positiveInt(request.query.fid);
		const target: SubscriptionTarget | null =
			topicId > 0 ? { kind: 'topic', id: topicId } : forumId > 0 ? { kind: 'forum', id: forumId } : null;
		if (target === null) return renderMessage(request, reply, this.deps, 400, t.common.badRequest);
		if (!(target.kind === 'topic' ? config.topicSubscriptions : config.forumSubscriptions))
			return renderMessage(request, reply, this.deps, 403, t.common.noPermission);

		const { subscriptions } = this.deps;
		if (action === 'subscribe' && !(await subscriptions.isReadable(target, viewer.group.id)))
			return renderMessage(request, reply, this.deps, 404, t.common.badRequest);

		const subscribed = await subscriptions.isSubscribed(target, viewer.id);
		if (action === 'subscribe' && subscribed)
			return renderMessage(
				request,
				reply,
				this.deps,
				200,
				target.kind === 'topic' ? t.misc.alreadySubscribedTopic : t.misc.alreadySubscribedForum,
			);
		if (action === 'unsubscribe' && !subscribed)
			return renderMessage(request, reply, this.deps, 200, target.kind === 'topic' ? t.misc.notSubscribedTopic : t.misc.notSubscribedForum);
		return target;
	}

	/** POST misc.php?action=markread | markforumread&fid=… (jeton CSRF vérifié en amont). */
	markRead = async (request: FastifyRequest<{ Querystring: MiscQuery; Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> => {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		const now = this.deps.page.clock();
		const cookieName = this.deps.trackCookieName;

		if (viewer.isGuest) return renderMessage(request, reply, this.deps, 403, lang.common.noPermission);

		if (request.query.action === 'markread') {
			// misc.php : last_visit = début de la visite, et suivi des sujets remis à zéro.
			await this.deps.online.setLastVisit(viewer.id, viewer.logged);
			setForumCookie(reply, this.deps.legacyCookie, cookieName, '', now + config.timeoutVisit, now, config.timeoutVisit);
			return reply.redirect('index.php', 303);
		}

		const forumId = positiveInt(request.query.fid ?? field(request.body, 'fid'));
		if (request.query.action !== 'markforumread' || forumId === 0)
			return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);

		const tracked = markRead(parseTrackedTopics(request.cookies[cookieName]), 'forums', forumId, now);
		setForumCookie(
			reply,
			this.deps.legacyCookie,
			cookieName,
			serializeTrackedTopics(tracked),
			now + config.timeoutVisit,
			now,
			config.timeoutVisit,
		);
		return reply.redirect(`viewforum.php?id=${forumId}`, 303);
	};
}
