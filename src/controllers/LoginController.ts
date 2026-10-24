/**
 * Contrôleur de login.php : formulaire, connexion (action=in), déconnexion (action=out).
 * Le mot de passe oublié (action=forget) est servi par PasswordResetController.
 *
 * Écarts assumés : jeton CSRF sur le formulaire, adresse de retour limitée aux pages du forum,
 * redirection HTTP immédiate au lieu de la page « Redirection… » (o_redirect_delay).
 */

import { randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { LegacyCookieConfig } from '../config.ts';
import { GUEST_USER_ID } from '../domain/models.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { setForumCookie, setSessionCookie } from '../http/session.ts';
import type { OnlineWriter } from '../repositories/OnlineRepository.ts';
import type { PhpCacheStore } from '../repositories/PhpCacheFiles.ts';
import type { CredentialsStore } from '../repositories/UserRepository.ts';
import { GUEST_COOKIE_SECONDS, logoutToken, punHash, REMEMBER_ME_SECONDS } from '../services/legacySession.ts';
import { checkPassword } from '../services/passwords.ts';
import { safeRedirect } from '../services/redirects.ts';

export interface LoginControllerDeps extends LayoutDeps {
	credentials: CredentialsStore;
	online: OnlineWriter;
	phpCache: PhpCacheStore | null;
	legacyCookie: LegacyCookieConfig;
	legacyBaseUrl: string;
}

export interface LoginQuery {
	action?: string;
	id?: string;
	csrf_token?: string;
}

/** Groupe des comptes non validés (PUN_UNVERIFIED). */
const UNVERIFIED_GROUP = 0;

export class LoginController {
	constructor(private readonly deps: LoginControllerDeps) {}

	/** GET login.php : formulaire, ou déconnexion (action=out). */
	show = async (request: FastifyRequest<{ Querystring: LoginQuery }>, reply: FastifyReply): Promise<FastifyReply> => {
		if (request.query.action === 'out') return this.logout(request, reply);
		// Mot de passe oublié : encore servi par le PHP (porté avec le service d'e-mail).
		if ((request.query.action === 'forget' || request.query.action === 'forget_2') && this.deps.legacyBaseUrl !== '')
			return reply.redirect(`${this.deps.legacyBaseUrl}/login.php?action=forget`);
		if (!request.viewer.isGuest) return reply.redirect('index.php');

		const { lang } = this.deps.page;
		const referer = request.headers.referer;
		return renderPage(
			request,
			reply,
			this.deps,
			'login.njk',
			{ pageId: 'login', titleParts: [request.board.boardTitle, lang.login.login], activeNav: 'login' },
			{ redirectUrl: referer !== undefined ? safeRedirect(referer, request.headers.host) : 'index.php' },
		);
	};

	/** POST login.php?action=in */
	login = async (request: FastifyRequest<{ Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> => {
		const { lang } = this.deps.page;
		const config = request.board;
		const now = this.deps.page.clock();
		const username = field(request.body, 'req_username').trim();
		const password = field(request.body, 'req_password').trim();

		const account = username !== '' ? await this.deps.credentials.findCredentials(username) : null;
		const check = account !== null ? checkPassword(password, account.passwordHash) : null;
		if (account === null || check === null || !check.valid)
			return renderMessage(request, reply, this.deps, 200, lang.login.wrongUserPass, {
				href: 'login.php?action=forget',
				label: lang.login.forgottenPass,
			});

		let passwordHash = account.passwordHash;
		if (check.upgradeTo !== null) {
			passwordHash = check.upgradeTo;
			await this.deps.credentials.updatePasswordHash(account.id, passwordHash);
		}

		if (account.groupId === UNVERIFIED_GROUP) {
			await this.deps.credentials.setGroup(account.id, config.defaultUserGroup);
			// Le nombre de membres change : cache_users_info.php sera régénéré par le PHP.
			await this.deps.phpCache?.invalidate('users_info');
		}

		// L'entrée « invité » de ce navigateur quitte la liste des présents.
		await this.deps.online.removeIdent(request.ip);

		const remember = field(request.body, 'save_pass') !== '';
		setSessionCookie(
			reply,
			this.deps,
			account.id,
			passwordHash,
			now + (remember ? REMEMBER_ME_SECONDS : config.timeoutVisit),
			now,
			config.timeoutVisit,
		);
		setForumCookie(
			reply,
			this.deps.legacyCookie,
			`${this.deps.legacyCookie.name}_track`,
			'',
			now + config.timeoutVisit,
			now,
			config.timeoutVisit,
		);

		return reply.redirect(safeRedirect(field(request.body, 'redirect_url'), request.headers.host), 303);
	};

	/**
	 * GET login.php?action=out&id=…&csrf_token=… : lien de l'en-tête, protégé par le jeton de
	 * header.php (lié à l'IP). Un lien invalide renvoie simplement à l'index, comme le PHP.
	 */
	private async logout(request: FastifyRequest<{ Querystring: LoginQuery }>, reply: FastifyReply): Promise<FastifyReply> {
		const { viewer, board: config } = request;
		const { query } = request;
		const now = this.deps.page.clock();

		if (viewer.isGuest || query.id !== String(viewer.id) || query.csrf_token !== logoutToken(viewer.id, request.ip))
			return reply.redirect('index.php');

		await this.deps.online.removeMember(viewer.id);
		await this.deps.online.setLastVisit(viewer.id, viewer.logged);
		setSessionCookie(
			reply,
			this.deps,
			GUEST_USER_ID,
			punHash(randomBytes(16).toString('hex')),
			now + GUEST_COOKIE_SECONDS,
			now,
			config.timeoutVisit,
		);

		return reply.redirect('index.php');
	}
}
