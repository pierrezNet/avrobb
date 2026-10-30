/**
 * Configuration de l'application, lue une fois dans les variables du Worker (wrangler.jsonc
 * « vars », secrets, et .dev.vars en développement) par src/worker.ts.
 */

import type { OAuthCredentials } from './adapters/oauth.ts';
import { type OAuthProviderId, parseAdminAccounts } from './services/oauth.ts';

/**
 * Cookies du forum : `<name>_session`, `<name>_csrf`, `<name>_track`, tous sur le chemin /. En HTTPS,
 * préfixés de `__Host-` (Secure, chemin /, sans Domain : ni un sous-domaine ni une page en HTTP ne
 * peuvent les poser ou les écraser) ; voir cookieName().
 */
export interface CookieConfig {
	name: string;
	/** Secret des signatures (session, jeton CSRF) : SESSION_SECRET, au moins 32 caractères. */
	secret: string;
	secure: boolean;
}

export interface AppConfig {
	cookie: CookieConfig;
	/**
	 * Connexion sans fournisseur SSO, pour le développement (DEV_LOGIN=1, depuis la machine
	 * seulement) ; toujours refusée quand ENVIRONMENT vaut « production ».
	 */
	devLogin: boolean;
	/** Fournisseurs configurés (identifiant et secret de l'application OAuth). */
	oauth: Partial<Record<OAuthProviderId, OAuthCredentials>>;
	/** ADMIN_ACCOUNTS : identités (« github:123456 ») qui deviennent administrateurs à la création du compte. */
	adminAccounts: ReadonlySet<string>;
	/** Envoi des e-mails par Resend (RESEND_API_KEY, MAIL_FROM) ; null : e-mails seulement journalisés. */
	mail: { apiKey: string; from: string } | null;
}

/**
 * Nom complet d'un cookie du forum. `__Host-` exige Secure et le chemin / ; un cookie limité à un
 * chemin (connexion SSO, /auth/) prend `__Secure-`.
 */
export function cookieName(cookie: CookieConfig, suffix: string, rootPath = true): string {
	const name = `${cookie.name}_${suffix}`;
	if (!cookie.secure) return name;
	return rootPath ? `__Host-${name}` : `__Secure-${name}`;
}

/** Variables texte du Worker (les liaisons D1, R2… sont à côté, ignorées ici). */
export type ConfigVars = Readonly<Record<string, unknown>>;

function text(env: ConfigVars, name: string): string {
	const value = env[name];
	return typeof value === 'string' ? value : '';
}

function sessionSecret(env: ConfigVars): string {
	const secret = text(env, 'SESSION_SECRET');
	if (secret === '') throw new Error('Variable manquante : SESSION_SECRET (wrangler secret put, ou .dev.vars en local)');
	if (secret.length < 32) throw new Error('SESSION_SECRET doit compter au moins 32 caractères');
	return secret;
}

function credentials(env: ConfigVars, prefix: 'GITHUB' | 'GOOGLE'): OAuthCredentials | null {
	const clientId = text(env, `${prefix}_CLIENT_ID`);
	const clientSecret = text(env, `${prefix}_CLIENT_SECRET`);
	return clientId !== '' && clientSecret !== '' ? { clientId, clientSecret } : null;
}

export function loadConfig(env: ConfigVars): AppConfig {
	const github = credentials(env, 'GITHUB');
	const google = credentials(env, 'GOOGLE');
	return {
		cookie: { name: 'avrobb', secret: sessionSecret(env), secure: text(env, 'COOKIE_SECURE') !== '0' },
		devLogin: text(env, 'DEV_LOGIN') === '1' && text(env, 'ENVIRONMENT') !== 'production',
		oauth: { ...(github !== null ? { github } : {}), ...(google !== null ? { google } : {}) },
		adminAccounts: parseAdminAccounts(text(env, 'ADMIN_ACCOUNTS')),
		mail:
			text(env, 'RESEND_API_KEY') !== '' && text(env, 'MAIL_FROM') !== ''
				? { apiKey: text(env, 'RESEND_API_KEY'), from: text(env, 'MAIL_FROM') }
				: null,
	};
}
