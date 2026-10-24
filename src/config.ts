/**
 * Configuration de l'application, lue depuis l'environnement (.env).
 */

/** $cookie_name, $cookie_seed, $cookie_path, $cookie_domain, $cookie_secure du config.php PHP. */
export interface LegacyCookieConfig {
	name: string;
	seed: string;
	path: string;
	domain: string;
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
	/** Cookie de session de l'installation FluxBB/PiloteVirtuel (cohabitation). */
	legacyCookie: LegacyCookieConfig;
	/** URL de l'installation PHP, pour les pages pas encore portées. */
	legacyBaseUrl: string;
	/** Racine de l'installation PHP sur le disque (avatars, fichiers de cache) ; vide si inaccessible. */
	legacyRoot: string;
	/** Node est derrière un reverse proxy (IP du client lue dans X-Forwarded-For). */
	trustProxy: boolean;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
	const value = env[name];

	if (value === undefined || value === '') throw new Error(`Variable d'environnement manquante : ${name}`);

	return value;
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
		legacyCookie: {
			name: required(env, 'LEGACY_COOKIE_NAME'),
			seed: required(env, 'LEGACY_COOKIE_SEED'),
			path: env.LEGACY_COOKIE_PATH ?? '/',
			domain: env.LEGACY_COOKIE_DOMAIN ?? '',
			secure: env.LEGACY_COOKIE_SECURE === '1',
		},
		legacyBaseUrl: (env.LEGACY_BASE_URL ?? '').replace(/\/$/, ''),
		legacyRoot: env.LEGACY_ROOT ?? '',
		trustProxy: env.TRUST_PROXY === '1',
	};
}
