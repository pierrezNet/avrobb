/**
 * Chiffrement Web Push (adapters/pushCrypto.ts) : vecteur officiel de la RFC 8291 (annexe A), sel
 * aléatoire, jeton VAPID vérifiable avec la clé publique.
 */

import { describe, expect, it } from 'vitest';
import { b64url, decodeB64url, encryptPushPayload, vapidJwt } from '../src/adapters/pushCrypto.ts';

const RFC8291 = {
	plaintext: 'When I grow up, I want to be a watermelon',
	asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
	asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
	uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
	authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
	salt: 'DGv6ra1nlYgDCS1FRnbzlw',
	header: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
	ciphertext: '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ',
};

async function rfcSenderKeys(): Promise<CryptoKeyPair> {
	const publicBytes = decodeB64url(RFC8291.asPublic);
	const publicJwk = { kty: 'EC', crv: 'P-256', x: b64url(publicBytes.slice(1, 33)), y: b64url(publicBytes.slice(33, 65)) };
	const algorithm = { name: 'ECDH', namedCurve: 'P-256' };
	return {
		privateKey: await crypto.subtle.importKey('jwk', { ...publicJwk, d: RFC8291.asPrivate }, algorithm, true, ['deriveBits']),
		publicKey: await crypto.subtle.importKey('jwk', publicJwk, algorithm, true, []),
	};
}

describe('chiffrement Web Push', () => {
	it('base64url sans remplissage, aller-retour', () => {
		const bytes = new Uint8Array([0, 251, 255, 1, 2]);
		expect(b64url(bytes)).not.toContain('=');
		expect([...decodeB64url(b64url(bytes))]).toEqual([...bytes]);
	});

	it('produit exactement le message chiffré de la RFC 8291', async () => {
		const body = await encryptPushPayload(RFC8291.plaintext, RFC8291.uaPublic, RFC8291.authSecret, {
			salt: decodeB64url(RFC8291.salt),
			senderKeys: await rfcSenderKeys(),
		});
		expect([...new Uint8Array(body)]).toEqual([...decodeB64url(RFC8291.header), ...decodeB64url(RFC8291.ciphertext)]);
	});

	it('sel aléatoire par défaut', async () => {
		const [a, b] = await Promise.all([1, 2].map(() => encryptPushPayload('x', RFC8291.uaPublic, RFC8291.authSecret)));
		expect(b64url(a as ArrayBuffer).slice(0, 22)).not.toBe(b64url(b as ArrayBuffer).slice(0, 22));
	});

	it('jeton VAPID : audience du service de push, échéance à 12 h, signature valide', async () => {
		const keys = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
		const jwt = await vapidJwt(
			'https://fcm.googleapis.com/fcm/send/abc',
			'mailto:dpo@pierrez.net',
			await crypto.subtle.exportKey('jwk', keys.privateKey),
			1000,
		);
		const [header = '', claims = '', signature = ''] = jwt.split('.');
		expect(JSON.parse(new TextDecoder().decode(decodeB64url(claims)))).toEqual({
			aud: 'https://fcm.googleapis.com',
			exp: 1000 + 12 * 3600,
			sub: 'mailto:dpo@pierrez.net',
		});
		const valid = await crypto.subtle.verify(
			{ name: 'ECDSA', hash: 'SHA-256' },
			keys.publicKey,
			decodeB64url(signature),
			new TextEncoder().encode(`${header}.${claims}`),
		);
		expect(valid).toBe(true);
	});
});
