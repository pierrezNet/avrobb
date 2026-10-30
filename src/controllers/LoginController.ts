/**
 * Contrôleur de login.php : page de connexion, connexion de développement (POST action=in) et
 * déconnexion (POST action=out, jeton CSRF vérifié en amont).
 *
 * Les comptes viendront d'un fournisseur SSO (lot 5) : il n'y a ni mot de passe ni inscription.
 * En attendant, DEV_LOGIN=1 permet de se connecter sous le nom d'un membre, depuis la machine
 * seulement (services/session.ts).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CookieConfig } from '../config.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { clearSessionCookie, setForumCookie, setSessionCookie, trackCookieName } from '../http/session.ts';
import type { OnlineWriter } from '../repositories/OnlineRepository.ts';
import type { AccountLookup } from '../repositories/UserRepository.ts';
import { safeRedirect } from '../services/redirects.ts';
import { isDevLoginAllowed } from '../services/session.ts';

export interface LoginControllerDeps extends LayoutDeps {
	accounts: AccountLookup;
	online: OnlineWriter;
	cookie: CookieConfig;
	devLogin: boolean;
}

export interface LoginQuery {
	action?: string;
}

export class LoginController {
	constructor(private readonly deps: LoginControllerDeps) {}

	/** GET login.php ; l'ancien lien de déconnexion en GET ramène simplement à l'index. */
	show = async (request: FastifyRequest<{ Querystring: LoginQuery }>, reply: FastifyReply): Promise<FastifyReply> => {
		if (request.query.action !== undefined || !request.viewer.isGuest) return reply.redirect('index.php');

		const { lang } = this.deps.page;
		const referer = request.headers.referer;
		return renderPage(
			request,
			reply,
			this.deps,
			'login.njk',
			{ pageId: 'login', titleParts: [request.board.boardTitle, lang.login.login], activeNav: 'login' },
			{
				devLogin: isDevLoginAllowed(this.deps.devLogin, request.ip),
				redirectUrl: referer !== undefined ? safeRedirect(referer, request.headers.host) : 'index.php',
			},
		);
	};

	/** POST login.php?action=in : connexion de développement. */
	login = async (request: FastifyRequest<{ Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> => {
		const { lang } = this.deps.page;
		if (!isDevLoginAllowed(this.deps.devLogin, request.ip))
			return renderMessage(request, reply, this.deps, 403, lang.login.devLoginRefused);

		const username = field(request.body, 'req_username').trim();
		const userId = username !== '' ? await this.deps.accounts.findIdByUsername(username) : null;
		if (userId === null) return renderMessage(request, reply, this.deps, 200, lang.login.unknownUser);

		const config = request.board;
		const now = this.deps.page.clock();
		// L'entrée « invité » de ce navigateur quitte la liste des présents.
		await this.deps.online.removeIdent(request.ip);
		setSessionCookie(reply, this.deps, userId, now);
		setForumCookie(reply, this.deps.cookie, trackCookieName(this.deps.cookie), '', now + config.timeoutVisit, now, config.timeoutVisit);

		return reply.redirect(safeRedirect(field(request.body, 'redirect_url'), request.headers.host), 303);
	};

	/** POST login.php?action=out */
	logout = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
		const { viewer } = request;
		if (!viewer.isGuest) {
			await this.deps.online.removeMember(viewer.id);
			await this.deps.online.setLastVisit(viewer.id, viewer.logged);
		}
		clearSessionCookie(reply, this.deps);
		return reply.redirect('index.php', 303);
	};
}
