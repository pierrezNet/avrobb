/**
 * Connexion par un fournisseur OAuth 2 (GitHub, Google), règles pures : adresses et portées de
 * chaque fournisseur, URL d'autorisation avec PKCE, cookie d'état signé (state, vérificateur PKCE,
 * page de retour), administrateurs initiaux (ADMIN_ACCOUNTS) et pseudo proposé au nouveau compte.
 *
 * Un compte est identifié par le couple (fournisseur, identifiant chez le fournisseur), jamais par
 * son adresse e-mail. Les appels réseau sont dans adapters/oauth.ts.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { checkUsername, normalizeUsername } from './accounts.ts';
import type { Ban } from './bans.ts';
import type { Censor } from './censor.ts';

export type OAuthProviderId = 'github' | 'google';

export interface OAuthProvider {
	id: OAuthProviderId;
	authorizeUrl: string;
	tokenUrl: string;
	scope: string;
}

/**
 * GitHub : profil public et adresses e-mail (pour retenir l'adresse principale vérifiée, qui servira
 * aux notifications). Google : OpenID Connect, nom et adresse.
 */
export const OAUTH_PROVIDERS: Readonly<Record<OAuthProviderId, OAuthProvider>> = {
	github: {
		id: 'github',
		authorizeUrl: 'https://github.com/login/oauth/authorize',
		tokenUrl: 'https://github.com/login/oauth/access_token',
		scope: 'read:user user:email',
	},
	google: {
		id: 'google',
		authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
		tokenUrl: 'https://oauth2.googleapis.com/token',
		scope: 'openid profile email',
	},
};

export function isOAuthProvider(value: string): value is OAuthProviderId {
	return value === 'github' || value === 'google';
}

/** Adresse de retour, fixe pour chaque fournisseur (à déclarer telle quelle chez lui). */
export function callbackUrl(baseUrl: string, provider: OAuthProviderId): string {
	return `${baseUrl}/auth/${provider}/callback`;
}

export function authorizationUrl(
	provider: OAuthProvider,
	params: { clientId: string; redirectUri: string; state: string; codeChallenge: string },
): string {
	const url = new URL(provider.authorizeUrl);
	url.searchParams.set('client_id', params.clientId);
	url.searchParams.set('redirect_uri', params.redirectUri);
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('scope', provider.scope);
	url.searchParams.set('state', params.state);
	url.searchParams.set('code_challenge', params.codeChallenge);
	url.searchParams.set('code_challenge_method', 'S256');
	// GitHub : ne pas proposer de créer un compte GitHub au milieu de la connexion.
	if (provider.id === 'github') url.searchParams.set('allow_signup', 'false');
	return url.toString();
}

/** Durée de validité d'une tentative de connexion (aller-retour chez le fournisseur). */
export const OAUTH_STATE_SECONDS = 600;

/** Contenu du cookie d'état, posé au départ vers le fournisseur et lu au retour. */
export interface OAuthState {
	provider: OAuthProviderId;
	/** Valeur aléatoire renvoyée par le fournisseur : le retour vient bien de cette tentative. */
	state: string;
	/** Vérificateur PKCE : seul ce navigateur peut échanger le code obtenu. */
	verifier: string;
	/** Page du forum où revenir après la connexion. */
	returnTo: string;
	expires: number;
}

function signState(payload: string, secret: string): string {
	return createHmac('sha256', `${secret}|oauth`).update(payload).digest('base64url');
}

export function buildStateCookie(value: OAuthState, secret: string): string {
	const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
	return `${payload}.${signState(payload, secret)}`;
}

/** Cookie d'état vérifié (signature, échéance, fournisseur, state renvoyé) ; null sinon. */
export function readStateCookie(
	raw: string | undefined,
	secret: string,
	expected: { provider: OAuthProviderId; state: string; now: number },
): OAuthState | null {
	const [payload = '', signature = '', extra] = (raw ?? '').split('.');
	if (payload === '' || extra !== undefined) return null;
	const wanted = Buffer.from(signState(payload, secret));
	const given = Buffer.from(signature);
	if (wanted.length !== given.length || !timingSafeEqual(wanted, given)) return null;

	let value: unknown;
	try {
		value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
	} catch {
		return null;
	}
	if (!isOAuthState(value)) return null;
	if (value.provider !== expected.provider || value.expires <= expected.now) return null;
	const sameState = Buffer.from(value.state);
	const returned = Buffer.from(expected.state);
	return sameState.length === returned.length && timingSafeEqual(sameState, returned) ? value : null;
}

function isOAuthState(value: unknown): value is OAuthState {
	if (typeof value !== 'object' || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.provider === 'string' &&
		isOAuthProvider(v.provider) &&
		typeof v.state === 'string' &&
		typeof v.verifier === 'string' &&
		typeof v.returnTo === 'string' &&
		typeof v.expires === 'number'
	);
}

/** ADMIN_ACCOUNTS : « github:123456,google:987 » → identités qui deviennent administrateurs à la création. */
export function parseAdminAccounts(value: string): Set<string> {
	return new Set(
		value
			.split(',')
			.map((entry) => entry.trim().toLowerCase())
			.filter((entry) => /^(github|google):[\w-]{1,64}$/.test(entry)),
	);
}

export function accountKey(provider: OAuthProviderId, providerId: string): string {
	return `${provider}:${providerId.toLowerCase()}`;
}

/** Plus long pseudo proposé avant le suffixe (25 caractères au plus, check_username()). */
const BASE_MAX = 22;

/**
 * Pseudo de départ d'un nouveau compte, d'après le fournisseur : le premier des noms proposés
 * (identifiant GitHub, nom affiché…) qui passe check_username(), sinon `fallback`.
 */
export function proposedUsername(
	candidates: readonly (string | null)[],
	fallback: string,
	rules: { guestLabel: string; bans: readonly Ban[]; censor: Censor | null },
): string {
	for (const candidate of candidates) {
		if (candidate === null) continue;
		const name = [...normalizeUsername(candidate)].slice(0, BASE_MAX).join('').trim();
		if (checkUsername(name, rules.guestLabel, rules.bans, rules.censor).length === 0) return name;
	}
	return fallback;
}

/** n-ième variante d'un pseudo déjà pris : « Nom », « Nom 2 », « Nom 3 »… */
export function usernameVariant(base: string, attempt: number): string {
	return attempt <= 1 ? base : `${base} ${attempt}`;
}
