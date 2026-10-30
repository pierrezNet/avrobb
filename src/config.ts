/**
 * Configuration de l'application, lue une fois dans les variables du Worker (wrangler.jsonc
 * « vars », secrets, et .dev.vars en développement) par src/worker.ts.
 */

/** Cookies du forum : `<name>_session`, `<name>_csrf`, `<name>_track`, tous sur le chemin /. */
export interface CookieConfig {
	name: string;
	/** Secret des signatures (session, jeton CSRF) : SESSION_SECRET, au moins 32 caractères. */
	secret: string;
	secure: boolean;
}

export interface AppConfig {
	cookie: CookieConfig;
	/** Connexion sans fournisseur SSO, pour le développement (DEV_LOGIN=1, depuis la machine seulement). */
	devLogin: boolean;
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

export function loadConfig(env: ConfigVars): AppConfig {
	return {
		cookie: { name: 'avrobb', secret: sessionSecret(env), secure: text(env, 'COOKIE_SECURE') !== '0' },
		devLogin: text(env, 'DEV_LOGIN') === '1',
	};
}
