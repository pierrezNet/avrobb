/**
 * Connexion par un fournisseur OAuth 2 (GitHub, Google) : départ vers le fournisseur
 * (GET /auth/<fournisseur>) et retour (GET /auth/<fournisseur>/callback).
 *
 * Au départ : `state` aléatoire et vérificateur PKCE dans un cookie signé de dix minutes, limité aux
 * adresses /auth/. Au retour : `state` comparé au cookie, code échangé avec le vérificateur, puis
 * compte trouvé par (fournisseur, identifiant) ou créé avec un pseudo tiré du fournisseur. Aucun
 * jeton du fournisseur n'est gardé. Ces deux pages GET n'écrivent qu'à la création d'un compte et
 * à l'ouverture de la session : c'est la connexion elle-même.
 */

import type { OAuthClient, OAuthCredentials } from '../adapters/oauth.ts';
import { createPkce, randomState } from '../adapters/oauth.ts';
import type { CookieConfig } from '../config.ts';
import { GroupId } from '../domain/models.ts';
import type { AppReply, AppRequest } from '../http/context.ts';
import { type LayoutDeps, renderMessage } from '../http/layout.ts';
import { setForumCookie, setSessionCookie, trackCookieName } from '../http/session.ts';
import type { AccountStore } from '../repositories/AccountRepository.ts';
import type { BanReader } from '../repositories/BanRepository.ts';
import type { CensorReader } from '../repositories/CensorRepository.ts';
import type { OnlineWriter } from '../repositories/OnlineRepository.ts';
import type { AccountLookup } from '../repositories/UserRepository.ts';
import { usernameSkeleton } from '../services/accounts.ts';
import { buildCensor } from '../services/censor.ts';
import {
	accountKey,
	authorizationUrl,
	buildStateCookie,
	callbackUrl,
	OAUTH_PROVIDERS,
	OAUTH_STATE_SECONDS,
	type OAuthProviderId,
	proposedUsername,
	readStateCookie,
	usernameVariant,
} from '../services/oauth.ts';
import { safeRedirect } from '../services/redirects.ts';

/** Liaison Rate Limiting de Workers (sous-ensemble). */
export interface RateLimiter {
	limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface AuthControllerDeps extends LayoutDeps {
	oauthClient: OAuthClient;
	oauthProviders: Partial<Record<OAuthProviderId, OAuthCredentials>>;
	adminAccounts: ReadonlySet<string>;
	accountStore: AccountStore;
	accounts: AccountLookup;
	bans: BanReader;
	censorship: CensorReader;
	online: OnlineWriter;
	cookie: CookieConfig;
	/** Limite de tentatives par adresse IP ; absente dans les tests et hors Cloudflare. */
	authRateLimiter?: RateLimiter;
}

export interface AuthQuery {
	code?: string;
	state?: string;
	error?: string;
	/** Page du forum où revenir (départ). */
	return?: string;
}

type AuthRequest = AppRequest<{ Querystring: AuthQuery }>;

/** Tentatives de pseudos libres avant d'abandonner (« Nom », « Nom 2 »…). */
const USERNAME_ATTEMPTS = 50;
const STATE_COOKIE_PATH = '/auth/';

export class AuthController {
	constructor(private readonly deps: AuthControllerDeps) {}

	stateCookieName(): string {
		return `${this.deps.cookie.name}_oauth`;
	}

	start = async (request: AuthRequest, reply: AppReply, provider: OAuthProviderId): Promise<AppReply> => {
		const credentials = this.deps.oauthProviders[provider];
		if (credentials === undefined) return renderMessage(request, reply, this.deps, 404, this.deps.page.lang.common.badRequest);
		const limited = await this.#rateLimited(request, reply);
		if (limited !== null) return limited;
		if (!request.viewer.isGuest) return reply.redirect('/');

		const now = this.deps.page.clock();
		const pkce = await createPkce();
		const state = randomState();
		const returnTo = safeRedirect(request.query.return ?? request.headers.referer ?? '', request.headers.host);
		reply.setCookie(
			this.stateCookieName(),
			buildStateCookie({ provider, state, verifier: pkce.verifier, returnTo, expires: now + OAUTH_STATE_SECONDS }, this.deps.cookie.secret),
			{ path: STATE_COOKIE_PATH, httpOnly: true, secure: this.deps.cookie.secure, sameSite: 'lax', maxAge: OAUTH_STATE_SECONDS },
		);
		return reply.redirect(
			authorizationUrl(OAUTH_PROVIDERS[provider], {
				clientId: credentials.clientId,
				redirectUri: callbackUrl(request.board.baseUrl, provider),
				state,
				codeChallenge: pkce.challenge,
			}),
		);
	};

	callback = async (request: AuthRequest, reply: AppReply, provider: OAuthProviderId): Promise<AppReply> => {
		const { lang } = this.deps.page;
		const credentials = this.deps.oauthProviders[provider];
		if (credentials === undefined) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
		const limited = await this.#rateLimited(request, reply);
		if (limited !== null) return limited;

		const now = this.deps.page.clock();
		const attempt = readStateCookie(request.cookies[this.stateCookieName()], this.deps.cookie.secret, {
			provider,
			state: request.query.state ?? '',
			now,
		});
		// Une tentative ne sert qu'une fois, réussie ou non.
		reply.clearCookie(this.stateCookieName(), { path: STATE_COOKIE_PATH });
		if (request.query.error !== undefined) return renderMessage(request, reply, this.deps, 200, lang.login.ssoCancelled);
		if (attempt === null || request.query.code === undefined || request.query.code === '')
			return renderMessage(request, reply, this.deps, 400, lang.login.ssoExpired);

		const identity = await this.deps.oauthClient.identify(provider, credentials, {
			code: request.query.code,
			verifier: attempt.verifier,
			redirectUri: callbackUrl(request.board.baseUrl, provider),
		});
		if (identity === null) return renderMessage(request, reply, this.deps, 502, lang.login.ssoFailed(lang.login.providers[provider]));

		const account =
			(await this.deps.accountStore.findByProvider(provider, identity.providerId)) ??
			(await this.#createAccount(request, provider, identity.providerId, identity.usernames, identity.email ?? '', now));
		if (account === null) return renderMessage(request, reply, this.deps, 500, lang.login.ssoFailed(lang.login.providers[provider]));

		// L'entrée « invité » de ce navigateur quitte la liste des présents.
		await this.deps.online.removeIdent(request.ip);
		setSessionCookie(reply, this.deps, { userId: account.id, version: account.sessionVersion }, now);
		const { timeoutVisit } = request.board;
		setForumCookie(reply, this.deps.cookie, trackCookieName(this.deps.cookie), '', now + timeoutVisit, now, timeoutVisit);
		return reply.redirect(attempt.returnTo);
	};

	/** Nouveau compte : pseudo du fournisseur rendu unique ; administrateur s'il figure dans ADMIN_ACCOUNTS. */
	async #createAccount(
		request: AuthRequest,
		provider: OAuthProviderId,
		providerId: string,
		usernames: readonly (string | null)[],
		email: string,
		now: number,
	): Promise<{ id: number; sessionVersion: number } | null> {
		const config = request.board;
		const { lang } = this.deps.page;
		const [bans, words] = await Promise.all([this.deps.bans.listBans(), config.censoring ? this.deps.censorship.listWords() : []]);
		const base = proposedUsername(usernames, lang.login.defaultUsername, {
			guestLabel: lang.common.guest,
			bans,
			censor: config.censoring ? buildCensor(words) : null,
		});
		const isAdmin = this.deps.adminAccounts.has(accountKey(provider, providerId));

		for (let attempt = 1; attempt <= USERNAME_ATTEMPTS; attempt += 1) {
			const username = usernameVariant(base, attempt);
			if ((await this.deps.accounts.findSimilarUsername(username, usernameSkeleton(username))) !== null) continue;
			const id = await this.deps.accountStore.createAccount({
				provider,
				providerId,
				username,
				email,
				groupId: isAdmin ? GroupId.Admin : config.defaultUserGroup,
				registeredAt: now,
				ip: request.ip,
				timezone: config.registration.defaultTimezone,
				dst: config.registration.defaultDst,
				style: config.defaultStyle,
				emailSetting: config.registration.defaultEmailSetting,
			});
			if (id !== null) return { id, sessionVersion: 0 };
		}
		return null;
	}

	async #rateLimited(request: AppRequest, reply: AppReply): Promise<AppReply | null> {
		const limiter = this.deps.authRateLimiter;
		if (limiter === undefined || (await limiter.limit({ key: `auth:${request.ip}` })).success) return null;
		reply.header('retry-after', '60');
		return renderMessage(request, reply, this.deps, 429, this.deps.page.lang.login.tooManyAttempts);
	}
}
