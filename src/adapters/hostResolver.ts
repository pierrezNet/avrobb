/**
 * Résolution inverse d'une adresse IP (gethostbyaddr() de moderate.php) par DNS sur HTTPS
 * (format JSON de Cloudflare) : un Worker n'a pas de résolveur DNS. Limitée dans le temps pour
 * qu'une réponse lente ne bloque pas la page.
 */

import type { HostResolver } from '../controllers/ModerateController.ts';
import { reverseDnsName } from '../services/hosts.ts';

const DOH_URL = 'https://cloudflare-dns.com/dns-query';
const TIMEOUT_MS = 2000;
/** Type d'enregistrement PTR. */
const PTR = 12;

interface DohAnswer {
	type?: number;
	data?: string;
}

export class DohHostResolver implements HostResolver {
	/** @param fetcher `fetch` enveloppé : appelé comme méthode, le `fetch` des Workers lève « Illegal invocation ». */
	constructor(private readonly fetcher: typeof fetch = (input, init) => fetch(input, init)) {}

	async reverse(ip: string): Promise<string> {
		const name = reverseDnsName(ip);
		if (name === null) return ip;
		try {
			const response = await this.fetcher(`${DOH_URL}?name=${encodeURIComponent(name)}&type=PTR`, {
				headers: { accept: 'application/dns-json' },
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});
			if (!response.ok) return ip;
			const body = (await response.json()) as { Answer?: DohAnswer[] };
			const host = body.Answer?.find((answer) => answer.type === PTR)?.data;
			// Nom pleinement qualifié (« host.example. ») : le point final est retiré, comme gethostbyaddr().
			return typeof host === 'string' && host !== '' ? host.replace(/\.$/, '') : ip;
		} catch {
			// gethostbyaddr() renvoie l'adresse elle-même quand elle ne se résout pas.
			return ip;
		}
	}
}
