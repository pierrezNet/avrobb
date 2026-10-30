/**
 * Ce qui remplace Node dans le Worker : lecture des images WebP, adresses IP et résolution inverse
 * par DNS sur HTTPS, e-mails journalisés, configuration lue dans les variables du Worker.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DohHostResolver } from '../src/adapters/hostResolver.ts';
import { LogMailer, ResendMailer, senderAddress } from '../src/adapters/mailer.ts';
import { loadConfig } from '../src/config.ts';
import type { AppRequest, LogContext } from '../src/http/context.ts';
import { sendInBackground } from '../src/http/mail.ts';
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

describe('ResendMailer', () => {
	const message = {
		to: 'membre@example.test',
		subject: 'Nouvelle réponse',
		text: 'Bonjour',
		replyTo: { email: 'auteur@example.test', name: 'Auteur' },
	};

	it('appel de l’API : clé, expéditeur nommé, texte brut, réponse à l’auteur', async () => {
		const requests: { url: string; init?: RequestInit }[] = [];
		const mailer = new ResendMailer('re_cle', 'forum@example.test', async (url, init) => {
			requests.push({ url, ...(init !== undefined ? { init } : {}) });
			return new Response('{"id":"1"}');
		});
		await mailer.send(message, boardConfig);
		expect(requests[0]?.url).toBe('https://api.resend.com/emails');
		expect(new Headers(requests[0]?.init?.headers).get('authorization')).toBe('Bearer re_cle');
		expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
			from: `"${boardConfig.boardTitle} E-mail automatique" <forum@example.test>`,
			to: ['membre@example.test'],
			subject: 'Nouvelle réponse',
			text: 'Bonjour',
			reply_to: 'auteur@example.test',
		});
	});

	it('destinataire sans adresse : rien n’est envoyé ; refus de l’API : erreur sans détail', async () => {
		let calls = 0;
		const mailer = new ResendMailer('re_cle', 'AvroBB <forum@example.test>', async () => {
			calls += 1;
			return new Response('{"message":"membre@example.test invalide"}', { status: 422 });
		});
		await mailer.send({ ...message, to: '' }, boardConfig);
		expect(calls).toBe(0);
		await expect(mailer.send(message, boardConfig)).rejects.toThrow('Resend : statut 422');
		await expect(mailer.send(message, boardConfig)).rejects.not.toThrow('membre@');
	});

	it('expéditeur : nom gardé s’il est donné, guillemets retirés du titre', () => {
		expect(senderAddress('AvroBB <f@example.test>', 'X')).toBe('AvroBB <f@example.test>');
		expect(senderAddress('f@example.test', 'Le "forum"')).toBe('"Le forum E-mail automatique" <f@example.test>');
	});
});

describe('envoi en tâche de fond', () => {
	it('un échec est noté et n’empêche pas les envois suivants', async () => {
		const tasks: Promise<unknown>[] = [];
		const errors: unknown[] = [];
		const sent: string[] = [];
		const request = {
			waitUntil: (task: Promise<unknown>) => tasks.push(task),
			log: { info: () => undefined, error: (context: LogContext) => errors.push(context.err) },
		} as unknown as AppRequest;
		const mailer = {
			send: async (mail: { to: string }) => {
				if (mail.to === 'a@example.test') throw new Error('panne');
				sent.push(mail.to);
			},
		};
		sendInBackground(
			request,
			mailer,
			[
				{ to: 'a@example.test', subject: 's', text: 't' },
				{ to: 'b@example.test', subject: 's', text: 't' },
			],
			boardConfig,
		);
		expect(tasks).toHaveLength(1);
		await Promise.all(tasks);
		expect(sent).toEqual(['b@example.test']);
		expect(errors).toHaveLength(1);
		sendInBackground(request, mailer, [], boardConfig);
		expect(tasks).toHaveLength(1);
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
		expect(loadConfig({ SESSION_SECRET: secret })).toEqual({
			cookie: { name: 'avrobb', secret, secure: true },
			devLogin: false,
			oauth: {},
			adminAccounts: new Set(),
			mail: null,
		});
		expect(loadConfig({ SESSION_SECRET: secret, COOKIE_SECURE: '0', DEV_LOGIN: '1' })).toMatchObject({
			cookie: { secure: false },
			devLogin: true,
		});
	});

	it('jamais de connexion de développement en production', () => {
		expect(loadConfig({ SESSION_SECRET: secret, DEV_LOGIN: '1', ENVIRONMENT: 'production' }).devLogin).toBe(false);
	});

	it('fournisseurs configurés seulement avec identifiant et secret ; administrateurs initiaux', () => {
		const config = loadConfig({
			SESSION_SECRET: secret,
			GITHUB_CLIENT_ID: 'id',
			GITHUB_CLIENT_SECRET: 'secret',
			GOOGLE_CLIENT_ID: 'sans-secret',
			ADMIN_ACCOUNTS: 'github:123, Google:abc ,autre:1,github:',
		});
		expect(config.oauth).toEqual({ github: { clientId: 'id', clientSecret: 'secret' } });
		expect(config.adminAccounts).toEqual(new Set(['github:123', 'google:abc']));
	});

	it('Resend seulement avec une clé et un expéditeur', () => {
		expect(loadConfig({ SESSION_SECRET: secret, RESEND_API_KEY: 're_x' }).mail).toBeNull();
		expect(loadConfig({ SESSION_SECRET: secret, RESEND_API_KEY: 're_x', MAIL_FROM: 'forum@example.test' }).mail).toEqual({
			apiKey: 're_x',
			from: 'forum@example.test',
		});
	});

	it('secret absent ou trop court : erreur explicite', () => {
		expect(() => loadConfig({})).toThrow('SESSION_SECRET');
		expect(() => loadConfig({ SESSION_SECRET: 'court' })).toThrow('32 caractères');
	});

	it('wrangler.jsonc : production déclarée, pas de connexion de développement', () => {
		const wrangler = readFileSync(path.join(import.meta.dirname, '..', 'wrangler.jsonc'), 'utf8');
		expect(wrangler).toContain('"ENVIRONMENT": "production"');
		expect(wrangler).not.toContain('DEV_LOGIN');
	});
});
