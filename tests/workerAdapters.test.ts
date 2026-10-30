/**
 * Ce qui remplace Node dans le Worker : lecture des images WebP, adresses IP et résolution inverse
 * par DNS sur HTTPS, e-mails journalisés, configuration lue dans les variables du Worker.
 */

import { describe, expect, it } from 'vitest';
import { DohHostResolver } from '../src/adapters/hostResolver.ts';
import { LogMailer } from '../src/adapters/mailer.ts';
import { loadConfig } from '../src/config.ts';
import type { LogContext } from '../src/http/context.ts';
import { isIpAddress, reverseDnsName } from '../src/services/hosts.ts';
import { readImageInfo } from '../src/services/images.ts';
import { boardConfig } from './fixtures.ts';

/** Débuts de vrais fichiers WebP (Pillow) : avec perte 300 × 200, sans perte 37 × 1000, étendu 5000 × 3. */
const WEBP = {
	lossy: '52494646d00000005745425056503820c40000003011009d012a2c01c8003ed168b153282624a2a0',
	lossless: '5249464628000000574542505650384c1b0000002f24c0f9000750b3ce34b3ff0105691b30f56fbf',
	extended: '52494646e800000057454250565038580a00000010000000871300020000414c50480a0000000107',
};

describe('readImageInfo : WebP', () => {
	it('dimensions des trois variantes', () => {
		expect(readImageInfo(Buffer.from(WEBP.lossy, 'hex'))).toEqual({ type: 'webp', width: 300, height: 200 });
		expect(readImageInfo(Buffer.from(WEBP.lossless, 'hex'))).toEqual({ type: 'webp', width: 37, height: 1000 });
		expect(readImageInfo(Buffer.from(WEBP.extended, 'hex'))).toEqual({ type: 'webp', width: 5000, height: 3 });
	});

	it('RIFF qui n’est pas une image, ou tronqué : refusé', () => {
		expect(readImageInfo(Buffer.from('RIFF\0\0\0\0WAVEfmt                       '))).toBeNull();
		expect(readImageInfo(Buffer.from(WEBP.lossy, 'hex').subarray(0, 20))).toBeNull();
	});
});

describe('adresses IP', () => {
	it('IPv4 et IPv6, avec ou sans « :: », IPv4 en fin d’IPv6', () => {
		for (const ip of ['192.0.2.1', '0.0.0.0', '2001:db8::1', '::1', '::', 'fe80::1:2:3:4', '::ffff:192.0.2.1', '1:2:3:4:5:6:7:8'])
			expect(isIpAddress(ip), ip).toBe(true);
		for (const ip of [
			'256.1.1.1',
			'1.2.3',
			'1.2.3.4.5',
			'01.2.3.4x',
			'2001:db8:::1',
			'1:2:3:4:5:6:7:8:9',
			'1::2::3',
			'g::1',
			':1:2',
			'exemple.fr',
			'',
		])
			expect(isIpAddress(ip), ip).toBe(false);
	});

	it('nom de la résolution inverse', () => {
		expect(reverseDnsName('192.0.2.5')).toBe('5.2.0.192.in-addr.arpa');
		expect(reverseDnsName('2001:db8::1')).toBe(`1.${'0.'.repeat(23)}8.b.d.0.1.0.0.2.ip6.arpa`);
		expect(reverseDnsName('pas une ip')).toBeNull();
	});
});

describe('DohHostResolver', () => {
	const answer =
		(body: unknown, status = 200) =>
		async () =>
			new Response(JSON.stringify(body), { status });

	it('nom PTR sans le point final ; l’adresse elle-même en cas d’échec', async () => {
		const asked: string[] = [];
		const resolver = new DohHostResolver(async (input) => {
			asked.push(String(input));
			return new Response(
				JSON.stringify({
					Answer: [
						{ type: 5, data: 'alias.' },
						{ type: 12, data: 'one.one.one.one.' },
					],
				}),
			);
		});
		expect(await resolver.reverse('1.1.1.1')).toBe('one.one.one.one');
		expect(asked).toEqual(['https://cloudflare-dns.com/dns-query?name=1.1.1.1.in-addr.arpa&type=PTR']);

		expect(await new DohHostResolver(answer({ Status: 3 })).reverse('192.0.2.1')).toBe('192.0.2.1');
		expect(await new DohHostResolver(answer({}, 500)).reverse('192.0.2.1')).toBe('192.0.2.1');
		expect(
			await new DohHostResolver(async () => {
				throw new Error('réseau');
			}).reverse('192.0.2.1'),
		).toBe('192.0.2.1');
		// Adresse invalide : aucune requête.
		expect(await new DohHostResolver(async () => Promise.reject(new Error('appel inattendu'))).reverse('abc')).toBe('abc');
	});
});

describe('LogMailer', () => {
	it('note le destinataire et le sujet, jamais le texte', async () => {
		const lines: { context: LogContext; message: string }[] = [];
		const mailer = new LogMailer({ info: (context, message) => lines.push({ context, message }), error: () => undefined });
		await mailer.send({ to: 'membre@example.test', subject: 'Nouvelle réponse', text: 'lien secret' }, boardConfig);
		expect(lines).toHaveLength(1);
		expect(lines[0]?.context).toEqual({ to: 'membre@example.test', subject: 'Nouvelle réponse' });
		expect(JSON.stringify(lines)).not.toContain('lien secret');
	});
});

describe('loadConfig', () => {
	const secret = 's'.repeat(32);

	it('cookies sécurisés par défaut, connexion de développement sur demande', () => {
		expect(loadConfig({ SESSION_SECRET: secret })).toEqual({ cookie: { name: 'avrobb', secret, secure: true }, devLogin: false });
		expect(loadConfig({ SESSION_SECRET: secret, COOKIE_SECURE: '0', DEV_LOGIN: '1' })).toMatchObject({
			cookie: { secure: false },
			devLogin: true,
		});
	});

	it('secret absent ou trop court : erreur explicite', () => {
		expect(() => loadConfig({})).toThrow('SESSION_SECRET');
		expect(() => loadConfig({ SESSION_SECRET: 'court' })).toThrow('32 caractères');
	});
});
