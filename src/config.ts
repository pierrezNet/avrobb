/**
 * Configuration de l'application, lue depuis l'environnement (.env).
 */

/** Cookies du forum : `<name>_session`, `<name>_csrf`, `<name>_track`, tous sur le chemin /. */
export interface CookieConfig {
	name: string;
	/** Secret des signatures (session, jeton CSRF) : SESSION_SECRET, au moins 32 caractères. */
	secret: string;
	secure: boolean;
}

export interface AppConfig {
	port: number;
	db: {
		host: string;
		port: number;
		user: string;
		password: string;
		database: string;
		tablePrefix: string;
	};
	cookie: CookieConfig;
	/** Connexion sans fournisseur SSO, pour le développement (DEV_LOGIN=1, depuis la machine seulement). */
	devLogin: boolean;
	/** URL de l'installation PHP, pour les pages pas encore portées. */
	legacyBaseUrl: string;
	/** Racine de l'installation PHP sur le disque (avatars, fichiers de cache) ; vide si inaccessible. */
	legacyRoot: string;
	/** Node est derrière un reverse proxy (IP du client lue dans X-Forwarded-For). */
	trustProxy: boolean;
	/** Sans SMTP configuré : dossier où écrire les e-mails (.eml) au lieu de sendmail ; null sinon. */
	mailOutbox: string | null;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
	const value = env[name];

	if (value === undefined || value === '') throw new Error(`Variable d'environnement manquante : ${name}`);

	return value;
}

function sessionSecret(env: NodeJS.ProcessEnv): string {
	const secret = required(env, 'SESSION_SECRET');
	if (secret.length < 32) throw new Error('SESSION_SECRET doit compter au moins 32 caractères');
	return secret;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
	return {
		port: Number(env.PORT ?? 3000),
		db: {
			host: env.DB_HOST ?? '127.0.0.1',
			port: Number(env.DB_PORT ?? 3306),
			user: required(env, 'DB_USER'),
			password: required(env, 'DB_PASSWORD'),
			database: required(env, 'DB_NAME'),
			tablePrefix: env.DB_PREFIX ?? '',
		},
		cookie: { name: 'avrobb', secret: sessionSecret(env), secure: env.COOKIE_SECURE === '1' },
		devLogin: env.DEV_LOGIN === '1',
		legacyBaseUrl: (env.LEGACY_BASE_URL ?? '').replace(/\/$/, ''),
		legacyRoot: env.LEGACY_ROOT ?? '',
		trustProxy: env.TRUST_PROXY === '1',
		mailOutbox: env.MAIL_OUTBOX !== undefined && env.MAIL_OUTBOX !== '' ? env.MAIL_OUTBOX : null,
	};
}
