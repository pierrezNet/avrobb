/**
 * Contrôleur de login.php : page de connexion (liens vers les fournisseurs SSO, voir
 * AuthController), connexion de développement (POST action=in), déconnexion (POST action=out) et
 * déconnexion de partout (POST action=out_all, users.session_version incrémenté). Jeton CSRF
 * vérifié en amont pour les POST.
 *
 * Il n'y a ni mot de passe ni inscription. DEV_LOGIN=1 permet de se connecter sous le nom d'un
 * membre, depuis la machine seulement et jamais en production (services/session.ts, config.ts).
 */

import type { OAuthCredentials } from '../adapters/oauth.ts';
import type { CookieConfig } from '../config.ts';
import type { AppReply, AppRequest } from '../http/context.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { clearSessionCookie, setForumCookie, setSessionCookie, trackCookieName } from '../http/session.ts';
import type { AccountStore } from '../repositories/AccountRepository.ts';
import type { OnlineWriter } from '../repositories/OnlineRepository.ts';
import type { AccountLookup, UserReader } from '../repositories/UserRepository.ts';
import type { OAuthProviderId } from '../services/oauth.ts';
import { safeRedirect } from '../services/redirects.ts';
import { isDevLoginAllowed } from '../services/session.ts';

export interface LoginControllerDeps extends LayoutDeps {
	accounts: AccountLookup;
	accountStore: AccountStore;
	users: UserReader;
	oauthProviders: Partial<Record<OAuthProviderId, OAuthCredentials>>;
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
	show = async (request: AppRequest<{ Querystring: LoginQuery }>, reply: AppReply): Promise<AppReply> => {
		if (request.query.action !== undefined || !request.viewer.isGuest) return reply.redirect('index.php');

		const { lang } = this.deps.page;
		const referer = request.headers.referer;
		const redirectUrl = referer !== undefined ? safeRedirect(referer, request.headers.host) : 'index.php';
		const providers = (['github', 'google'] as const)
			.filter((provider) => this.deps.oauthProviders[provider] !== undefined)
			.map((provider) => ({
				id: provider,
				label: lang.login.signInWith(lang.login.providers[provider]),
				href: `auth/${provider}?return=${encodeURIComponent(redirectUrl)}`,
			}));
		return renderPage(
			request,
			reply,
			this.deps,
			'login.njk',
			{ pageId: 'login', titleParts: [request.board.boardTitle, lang.login.login], activeNav: 'login' },
			{
				providers,
				devLogin: isDevLoginAllowed(this.deps.devLogin, request.ip),
				redirectUrl,
			},
		);
	};

	/** POST login.php?action=in : connexion de développement. */
	login = async (request: AppRequest<{ Body: FormBody }>, reply: AppReply): Promise<AppReply> => {
		const { lang } = this.deps.page;
		if (!isDevLoginAllowed(this.deps.devLogin, request.ip))
			return renderMessage(request, reply, this.deps, 403, lang.login.devLoginRefused);

		const username = field(request.body, 'req_username').trim();
		const userId = username !== '' ? await this.deps.accounts.findIdByUsername(username) : null;
		const record = userId !== null ? await this.deps.users.findViewer(userId) : null;
		if (userId === null || record === null) return renderMessage(request, reply, this.deps, 200, lang.login.unknownUser);

		const config = request.board;
		const now = this.deps.page.clock();
		// L'entrée « invité » de ce navigateur quitte la liste des présents.
		await this.deps.online.removeIdent(request.ip);
		setSessionCookie(reply, this.deps, { userId, version: record.sessionVersion }, now);
		setForumCookie(reply, this.deps.cookie, trackCookieName(this.deps.cookie), '', now + config.timeoutVisit, now, config.timeoutVisit);

		return reply.redirect(safeRedirect(field(request.body, 'redirect_url'), request.headers.host), 303);
	};

	/** POST login.php?action=out */
	logout = async (request: AppRequest, reply: AppReply): Promise<AppReply> => {
		const { viewer } = request;
		if (!viewer.isGuest) {
			await this.deps.online.removeMember(viewer.id);
			await this.deps.online.setLastVisit(viewer.id, viewer.logged);
		}
		clearSessionCookie(reply, this.deps);
		return reply.redirect('index.php', 303);
	};

	/** POST login.php?action=out_all : toutes les sessions du membre deviennent invalides. */
	logoutEverywhere = async (request: AppRequest, reply: AppReply): Promise<AppReply> => {
		if (!request.viewer.isGuest) await this.deps.accountStore.endAllSessions(request.viewer.id);
		return this.logout(request, reply);
	};
}
