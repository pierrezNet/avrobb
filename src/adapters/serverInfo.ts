/**
 * Informations sur le serveur pour admin_statistics.php : charge moyenne (/proc/loadavg ou uptime
 * dans le PHP), système et version de l'environnement d'exécution.
 */

import { loadavg, platform, release } from 'node:os';

export interface ServerInfo {
	/** Charges moyennes sur 1, 5 et 15 minutes ; null si le système ne les fournit pas (Windows). */
	loadAverage(): readonly number[] | null;
	operatingSystem(): string;
	runtimeVersion(): string;
}

export class NodeServerInfo implements ServerInfo {
	loadAverage(): readonly number[] | null {
		return platform() === 'win32' ? null : loadavg();
	}

	operatingSystem(): string {
		return `${platform()} ${release()}`;
	}

	runtimeVersion(): string {
		return process.version;
	}
}
