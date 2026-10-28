/**
 * Résolution inverse d'une adresse IP (gethostbyaddr() de moderate.php), limitée dans le temps
 * pour qu'un serveur DNS lent ne bloque pas la page.
 */

import { Resolver } from 'node:dns/promises';
import type { HostResolver } from '../controllers/ModerateController.ts';

const TIMEOUT_MS = 2000;

export class DnsHostResolver implements HostResolver {
	async reverse(ip: string): Promise<string> {
		const resolver = new Resolver({ timeout: TIMEOUT_MS, tries: 1 });
		try {
			const names = await resolver.reverse(ip);
			return names[0] ?? ip;
		} catch {
			// gethostbyaddr() renvoie l'adresse elle-même quand elle ne se résout pas.
			return ip;
		}
	}
}
