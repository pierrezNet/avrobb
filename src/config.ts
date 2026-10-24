/**
 * Configuration de l'application, lue depuis l'environnement (.env).
 */

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
	legacyCookie: {
		name: string;
		seed: string;
	};
	/** Dossier des feuilles de style FluxBB (Air.css…), servi sous /style. */
	styleDir: string;
	/** URL de l'installation PHP, pour les pages pas encore portées. */
	legacyBaseUrl: string;
	/** Racine de l'installation PHP sur le disque (avatars). */
	legacyRoot: string;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
	const value = env[name];

	if (value === undefined || value === '')
		throw new Error(`Variable d'environnement manquante : ${name}`);

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
		},
		styleDir: required(env, 'STYLE_DIR'),
		legacyBaseUrl: (env.LEGACY_BASE_URL ?? '').replace(/\/$/, ''),
		legacyRoot: env.LEGACY_ROOT ?? '',
	};
}
