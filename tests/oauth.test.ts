/**
 * Connexion SSO : règles pures (services/oauth.ts), appels aux fournisseurs (adapters/oauth.ts,
 * avec un faux `fetch`) et PKCE.
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createPkce, FetchOAuthClient, randomState } from '../src/adapters/oauth.ts';
import {
	accountKey,
	authorizationUrl,
	buildStateCookie,
	callbackUrl,
	OAUTH_PROVIDERS,
	type OAuthState,
	parseAdminAccounts,
	proposedUsername,
	readStateCookie,
	usernameVariant,
} from '../src/services/oauth.ts';

const SECRET = 'x'.repeat(32);
const NOW = 1_800_000_000;

describe('URL d’autorisation et de retour', () => {
	it('GitHub : client, retour, portées, state et PKCE S256', () => {
		const url = new URL(
			authorizationUrl(OAUTH_PROVIDERS.github, {
				clientId: 'abc',
				redirectUri: callbackUrl('https://forum.test', 'github'),
				state: 's1',
				codeChallenge: 'c1',
			}),
		);
		expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
		expect(Object.fromEntries(url.searchParams)).toEqual({
			client_id: 'abc',
			redirect_uri: 'https://forum.test/auth/github/callback',
			response_type: 'code',
			scope: 'read:user user:email',
			state: 's1',
			code_challenge: 'c1',
			code_challenge_method: 'S256',
			allow_signup: 'false',
		});
	});

	it('Google : OpenID Connect', () => {
		const url = new URL(authorizationUrl(OAUTH_PROVIDERS.google, { clientId: 'g', redirectUri: 'r', state: 's', codeChallenge: 'c' }));
		expect(url.hostname).toBe('accounts.google.com');
		expect(url.searchParams.get('scope')).toBe('openid profile email');
		expect(url.searchParams.has('allow_signup')).toBe(false);
	});
});

describe('cookie d’état', () => {
	const state: OAuthState = {
		provider: 'github',
		state: 'etat-aleatoire',
		verifier: 'v'.repeat(43),
		returnTo: 'viewtopic.php?id=4',
		expires: NOW + 600,
	};
	const cookie = buildStateCookie(state, SECRET);
	const expected = { provider: 'github' as const, state: 'etat-aleatoire', now: NOW };

	it('relu si la signature, le fournisseur, le state et l’échéance concordent', () => {
		expect(readStateCookie(cookie, SECRET, expected)).toEqual(state);
	});

	it('refusé sinon', () => {
		expect(readStateCookie(cookie, 'autre-secret'.repeat(3), expected)).toBeNull();
		expect(readStateCookie(cookie, SECRET, { ...expected, state: 'autre' })).toBeNull();
		expect(readStateCookie(cookie, SECRET, { ...expected, provider: 'google' })).toBeNull();
		expect(readStateCookie(cookie, SECRET, { ...expected, now: NOW + 600 })).toBeNull();
		expect(readStateCookie(undefined, SECRET, expected)).toBeNull();
		expect(readStateCookie(`${cookie}.x`, SECRET, expected)).toBeNull();
		// Contenu modifié (page de retour changée) : la signature ne correspond plus.
		const [, signature] = cookie.split('.');
		const forged = Buffer.from(JSON.stringify({ ...state, returnTo: 'admin_index.php' })).toString('base64url');
		expect(readStateCookie(`${forged}.${signature}`, SECRET, expected)).toBeNull();
	});
});

describe('comptes', () => {
	const rules = { guestLabel: 'Invité', bans: [], censor: null };

	it('ADMIN_ACCOUNTS : fournisseurs connus, identifiants en minuscules', () => {
		expect(parseAdminAccounts(' github:12 ,google:ABC,twitter:1, ,github:a b')).toEqual(new Set(['github:12', 'google:abc']));
		expect(accountKey('google', 'ABC')).toBe('google:abc');
	});

	it('pseudo proposé : premier nom valable, raccourci, sinon le nom par défaut', () => {
		expect(proposedUsername(['epierrez', 'Emmanuel Pierrez'], 'Membre', rules)).toBe('epierrez');
		expect(proposedUsername([null, '  Emmanuel   Pierrez '], 'Membre', rules)).toBe('Emmanuel Pierrez');
		expect(proposedUsername(['x', '192.0.2.1', 'invité'], 'Membre', rules)).toBe('Membre');
		expect(proposedUsername(['Un nom vraiment beaucoup trop long pour le forum'], 'Membre', rules)).toBe('Un nom vraiment beauco');
		const banned = { ...rules, bans: [{ id: 1, username: 'epierrez', ip: '', email: '', message: '', expire: null }] };
		expect(proposedUsername(['epierrez', 'Emmanuel'], 'Membre', banned)).toBe('Emmanuel');
	});

	it('variantes d’un pseudo pris', () => {
		expect([1, 2, 3].map((n) => usernameVariant('Max', n))).toEqual(['Max', 'Max 2', 'Max 3']);
	});
});

describe('PKCE', () => {
	it('empreinte S256 du vérificateur, en base64url ; valeurs aléatoires distinctes', async () => {
		const { verifier, challenge } = await createPkce();
		expect(verifier).toMatch(/^[\w-]{43}$/);
		expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
		expect((await createPkce()).verifier).not.toBe(verifier);
		expect(randomState()).not.toBe(randomState());
	});
});

describe('FetchOAuthClient', () => {
	const credentials = { clientId: 'id', clientSecret: 'secret' };
	const params = { code: 'code-1', verifier: 'verif', redirectUri: 'https://forum.test/auth/github/callback' };
	const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

	it('GitHub : code échangé avec le vérificateur, identité et adresse principale vérifiée', async () => {
		const requests: { url: string; init?: RequestInit }[] = [];
		const client = new FetchOAuthClient(async (url, init) => {
			requests.push({ url, ...(init !== undefined ? { init } : {}) });
			if (url.endsWith('/access_token')) return json({ access_token: 'jeton' });
			if (url.endsWith('/user')) return json({ id: 4242, login: 'epierrez', name: 'Emmanuel Pierrez', email: null });
			return json([
				{ email: 'secondaire@example.test', primary: false, verified: true },
				{ email: 'principale@example.test', primary: true, verified: true },
			]);
		});
		expect(await client.identify('github', credentials, params)).toEqual({
			providerId: '4242',
			usernames: ['epierrez', 'Emmanuel Pierrez'],
			email: 'principale@example.test',
		});
		const token = requests[0];
		expect(token?.url).toBe('https://github.com/login/oauth/access_token');
		expect(Object.fromEntries(new URLSearchParams(String(token?.init?.body)))).toMatchObject({
			client_id: 'id',
			client_secret: 'secret',
			code: 'code-1',
			code_verifier: 'verif',
			redirect_uri: params.redirectUri,
		});
		expect(new Headers(requests[1]?.init?.headers).get('authorization')).toBe('Bearer jeton');
		expect(new Headers(requests[1]?.init?.headers).get('user-agent')).toBe('AvroBB');
	});

	it('GitHub : adresse non vérifiée ou liste refusée → pas d’adresse', async () => {
		const client = new FetchOAuthClient(async (url) => {
			if (url.endsWith('/access_token')) return json({ access_token: 'jeton' });
			if (url.endsWith('/user')) return json({ id: 1, login: 'a' });
			return json({ message: 'interdit' }, 403);
		});
		expect((await client.identify('github', credentials, params))?.email).toBeNull();
	});

	it('Google : sub, noms, adresse seulement si vérifiée', async () => {
		const client = new FetchOAuthClient(async (url) =>
			url.includes('oauth2.googleapis.com')
				? json({ access_token: 'jeton', id_token: 'x' })
				: json({ sub: '1098', name: 'Emmanuel P.', given_name: 'Emmanuel', email: 'e@example.test', email_verified: false }),
		);
		expect(await client.identify('google', credentials, params)).toEqual({
			providerId: '1098',
			usernames: ['Emmanuel P.', 'Emmanuel'],
			email: null,
		});
	});

	it('code refusé, réponse illisible ou réseau en panne : null', async () => {
		expect(
			await new FetchOAuthClient(async () => json({ error: 'bad_verification_code' })).identify('github', credentials, params),
		).toBeNull();
		expect(await new FetchOAuthClient(async () => json({}, 401)).identify('github', credentials, params)).toBeNull();
		expect(await new FetchOAuthClient(async () => new Response('<html>')).identify('github', credentials, params)).toBeNull();
		expect(
			await new FetchOAuthClient(async () => {
				throw new Error('réseau');
			}).identify('google', credentials, params),
		).toBeNull();
	});
});
