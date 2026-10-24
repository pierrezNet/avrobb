/**
 * Contrôleur de misc.php pour les règles et « marquer comme lu ». Les autres actions (e-mail à un
 * membre, signalement, abonnements) restent servies par le PHP jusqu'au lot Rédaction.
 *
 * Écart assumé : « marquer comme lu » se fait par un formulaire POST (jeton CSRF) ; un ancien lien
 * GET, venu des pages PHP, affiche une confirmation au lieu d'écrire.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { LegacyCookieConfig } from '../config.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { setForumCookie } from '../http/session.ts';
import type { OnlineWriter } from '../repositories/OnlineRepository.ts';
import { markRead, parseTrackedTopics, serializeTrackedTopics } from '../services/trackedTopics.ts';
import { positiveInt } from './params.ts';

export interface MiscControllerDeps extends LayoutDeps {
	online: OnlineWriter;
	legacyCookie: LegacyCookieConfig;
	legacyBaseUrl: string;
	trackCookieName: string;
}

export interface MiscQuery {
	action?: string;
	fid?: string;
}

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

		// E-mail à un membre, signalement, abonnements : encore servis par le PHP.
		if (this.deps.legacyBaseUrl !== '') {
			const search = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
			return reply.redirect(`${this.deps.legacyBaseUrl}/misc.php${search}`);
		}
		return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
	};

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
