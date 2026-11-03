/**
 * Notifications push : abonnement reçu d'un navigateur (services/push.ts) et envoi au service de
 * push (adapters/webPush.ts) avec une doublure de fetch.
 */

import { describe, expect, it } from 'vitest';
import { b64url } from '../src/adapters/pushCrypto.ts';
import { WebPushSender } from '../src/adapters/webPush.ts';
import { readPushSubscription } from '../src/services/push.ts';

const keys = { p256dh: 'p'.repeat(20), auth: 'a'.repeat(20) };

describe('readPushSubscription()', () => {
	it('services de push des navigateurs seulement, en HTTPS, clés base64url', () => {
		for (const endpoint of [
			'https://fcm.googleapis.com/fcm/send/abc',
			'https://updates.push.services.mozilla.com/wpush/v2/abc',
			'https://web.push.apple.com/QF4abc',
			'https://wns2-par02p.notify.windows.com/w/?token=abc',
		])
			expect(readPushSubscription({ endpoint, ...keys })).not.toBeNull();
		for (const endpoint of [
			'https://evil.example/fcm.googleapis.com',
			'http://fcm.googleapis.com/x',
			'https://fcm.googleapis.com.evil.example/x',
			'pas une adresse',
		])
			expect(readPushSubscription({ endpoint, ...keys })).toBeNull();
		expect(readPushSubscription({ endpoint: 'https://fcm.googleapis.com/x', p256dh: 'court', auth: keys.auth })).toBeNull();
		expect(readPushSubscription({ endpoint: 'https://fcm.googleapis.com/x', p256dh: keys.p256dh, auth: 'a+b/c'.repeat(5) })).toBeNull();
	});
});

describe('WebPushSender', async () => {
	const signing = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])) as CryptoKeyPair;
	const receiver = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
	const subscription = {
		endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
		p256dh: b64url(await crypto.subtle.exportKey('raw', receiver.publicKey)),
		auth: b64url(crypto.getRandomValues(new Uint8Array(16))),
	};
	const message = { title: 'Message privé de Tessy', body: 'Bonjour', url: '/pms_view.php?tid=1', tag: 'pm-1', lang: 'fr' as const };
	const silent = { error: () => undefined, info: () => undefined };
	const privateKey = await crypto.subtle.exportKey('jwk', signing.privateKey);
	const sender = async (status: number, calls: { url: string; init: RequestInit | undefined }[] = []) =>
		new WebPushSender(
			{ publicKey: 'BPub', privateKey, subject: 'mailto:dpo@pierrez.net' },
			() => 1000,
			silent,
			async (url, init) => {
				calls.push({ url, init });
				return new Response(null, { status });
			},
		);

	it('POST chiffré et signé au service de push', async () => {
		const calls: { url: string; init: RequestInit | undefined }[] = [];
		expect(await (await sender(201, calls)).send(subscription, message)).toBe('sent');
		const headers = calls[0]?.init?.headers as Record<string, string>;
		expect(calls[0]?.url).toBe(subscription.endpoint);
		expect(headers['Content-Encoding']).toBe('aes128gcm');
		expect(headers.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=BPub$/);
		expect(headers.TTL).toBe('86400');
		// Corps chiffré : le texte n'y apparaît pas en clair.
		expect(new TextDecoder().decode(calls[0]?.init?.body as ArrayBuffer)).not.toContain('Tessy');
	});

	it('abonnement expiré (404, 410) à effacer ; autre refus : échec', async () => {
		expect(await (await sender(410)).send(subscription, message)).toBe('gone');
		expect(await (await sender(404)).send(subscription, message)).toBe('gone');
		expect(await (await sender(500)).send(subscription, message)).toBe('failed');
	});
});
