/**
 * Appels aux fournisseurs OAuth (GitHub, Google), écrits à la main avec `fetch` : échange du code
 * d'autorisation (avec le vérificateur PKCE) contre un jeton d'accès, puis lecture de l'identité.
 * Le jeton n'est gardé que le temps de ces appels. Les règles (adresses, état) sont dans
 * services/oauth.ts.
 */

import { OAUTH_PROVIDERS, type OAuthProviderId } from '../services/oauth.ts';

/** Ce qu'AvroBB retient d'un fournisseur. */
export interface OAuthIdentity {
	/** Identifiant stable chez le fournisseur (jamais l'adresse e-mail). */
	providerId: string;
	/** Noms proposés pour le pseudo, du préféré au moins bon. */
	usernames: (string | null)[];
	/** Adresse vérifiée par le fournisseur, ou null. */
	email: string | null;
}

export interface OAuthCredentials {
	clientId: string;
	clientSecret: string;
}

export interface OAuthClient {
	/** Identité du membre, ou null si le fournisseur refuse le code ou ne répond pas. */
	identify(
		provider: OAuthProviderId,
		credentials: OAuthCredentials,
		params: { code: string; verifier: string; redirectUri: string },
	): Promise<OAuthIdentity | null>;
}

/** Paire PKCE : vérificateur aléatoire gardé dans le cookie d'état, empreinte envoyée au fournisseur. */
export async function createPkce(): Promise<{ verifier: string; challenge: string }> {
	const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/** Valeur aléatoire du paramètre `state`. */
export function randomState(): string {
	return base64url(crypto.getRandomValues(new Uint8Array(24)));
}

function base64url(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString('base64url');
}

const TIMEOUT_MS = 8000;
/** GitHub exige un User-Agent. */
const USER_AGENT = 'AvroBB';

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export class FetchOAuthClient implements OAuthClient {
	/** @param fetcher `fetch` enveloppé : appelé comme méthode, le `fetch` des Workers lève « Illegal invocation ». */
	constructor(private readonly fetcher: Fetcher = (input, init) => fetch(input, init)) {}

	async identify(
		provider: OAuthProviderId,
		credentials: OAuthCredentials,
		params: { code: string; verifier: string; redirectUri: string },
	): Promise<OAuthIdentity | null> {
		try {
			const token = await this.#token(provider, credentials, params);
			if (token === null) return null;
			return provider === 'github' ? await this.#github(token) : await this.#google(token);
		} catch {
			// Réseau, délai dépassé ou réponse illisible : la connexion échoue proprement.
			return null;
		}
	}

	async #token(
		provider: OAuthProviderId,
		credentials: OAuthCredentials,
		params: { code: string; verifier: string; redirectUri: string },
	): Promise<string | null> {
		const response = await this.fetcher(OAUTH_PROVIDERS[provider].tokenUrl, {
			method: 'POST',
			headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', 'user-agent': USER_AGENT },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				client_id: credentials.clientId,
				client_secret: credentials.clientSecret,
				code: params.code,
				redirect_uri: params.redirectUri,
				code_verifier: params.verifier,
			}),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (!response.ok) return null;
		const body = (await response.json()) as { access_token?: unknown };
		return typeof body.access_token === 'string' && body.access_token !== '' ? body.access_token : null;
	}

	async #get(url: string, token: string): Promise<unknown> {
		const response = await this.fetcher(url, {
			headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'user-agent': USER_AGENT },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (!response.ok) throw new Error(`${url} : ${response.status}`);
		return response.json();
	}

	async #github(token: string): Promise<OAuthIdentity | null> {
		const user = (await this.#get('https://api.github.com/user', token)) as { id?: unknown; login?: unknown; name?: unknown };
		if (typeof user.id !== 'number' || typeof user.login !== 'string') return null;
		// Adresse principale vérifiée ; la liste peut être refusée (portée retirée par le membre).
		let email: string | null = null;
		try {
			const emails = (await this.#get('https://api.github.com/user/emails', token)) as {
				email?: unknown;
				primary?: unknown;
				verified?: unknown;
			}[];
			const primary = Array.isArray(emails) ? emails.find((entry) => entry.primary === true && entry.verified === true) : undefined;
			if (typeof primary?.email === 'string') email = primary.email;
		} catch {
			email = null;
		}
		return { providerId: String(user.id), usernames: [user.login, typeof user.name === 'string' ? user.name : null], email };
	}

	async #google(token: string): Promise<OAuthIdentity | null> {
		const info = (await this.#get('https://openidconnect.googleapis.com/v1/userinfo', token)) as {
			sub?: unknown;
			name?: unknown;
			given_name?: unknown;
			email?: unknown;
			email_verified?: unknown;
		};
		if (typeof info.sub !== 'string' || info.sub === '') return null;
		const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
		return {
			providerId: info.sub,
			usernames: [text(info.name), text(info.given_name)],
			email: info.email_verified === true ? text(info.email) : null,
		};
	}
}
