/**
 * Chiffrement Web Push (RFC 8291, aes128gcm) et jeton VAPID (RFC 8292, ES256), avec crypto.subtle
 * seulement. Repris de Donne Ton Point, vérifié par le vecteur de l'annexe A de la RFC 8291.
 */

export function b64url(buffer: ArrayBuffer | Uint8Array): string {
	const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function decodeB64url(text: string): Uint8Array<ArrayBuffer> {
	const base64 = text
		.replace(/-/g, '+')
		.replace(/_/g, '/')
		.padEnd(text.length + ((4 - (text.length % 4)) % 4), '=');
	return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function concat(...arrays: Uint8Array[]): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(arrays.reduce((length, array) => length + array.length, 0));
	let offset = 0;
	for (const array of arrays) {
		out.set(array, offset);
		offset += array.length;
	}
	return out;
}

async function hmacSha256(key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
	const imported = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	return new Uint8Array(await crypto.subtle.sign('HMAC', imported, data));
}

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number) {
	const imported = await crypto.subtle.importKey('raw', ikm, { name: 'HKDF' }, false, ['deriveBits']);
	return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, imported, length * 8));
}

const P256 = { name: 'ECDH', namedCurve: 'P-256' } as const;
const SALT_LENGTH = 16;
const RECORD_SIZE = 4096;
const encoder = new TextEncoder();

export interface EncryptionSeed {
	salt: Uint8Array<ArrayBuffer>;
	senderKeys: CryptoKeyPair;
}

async function randomSeed(): Promise<EncryptionSeed> {
	return {
		salt: crypto.getRandomValues(new Uint8Array(SALT_LENGTH)),
		senderKeys: (await crypto.subtle.generateKey(P256, true, ['deriveBits'])) as CryptoKeyPair,
	};
}

/** Corps chiffré d'une notification pour l'abonnement (clés p256dh et auth du navigateur). */
export async function encryptPushPayload(payload: string, p256dh: string, auth: string, seed?: EncryptionSeed): Promise<ArrayBuffer> {
	const { salt, senderKeys } = seed ?? (await randomSeed());
	const receiverPublicKey = decodeB64url(p256dh);
	const senderPublicKey = new Uint8Array((await crypto.subtle.exportKey('raw', senderKeys.publicKey)) as ArrayBuffer);

	const receiverKey = await crypto.subtle.importKey('raw', receiverPublicKey, P256, false, []);
	const sharedSecret = new Uint8Array(
		await crypto.subtle.deriveBits({ name: 'ECDH', public: receiverKey } as EcdhKeyDeriveParams, senderKeys.privateKey, 256),
	);
	const pseudoRandomKey = await hmacSha256(decodeB64url(auth), sharedSecret);
	const keyInfo = concat(encoder.encode('WebPush: info\x00'), receiverPublicKey, senderPublicKey, new Uint8Array([1]));
	const inputKey = await hmacSha256(pseudoRandomKey, keyInfo);

	const contentKey = await hkdf(salt, inputKey, encoder.encode('Content-Encoding: aes128gcm\x00'), 16);
	const nonce = await hkdf(salt, inputKey, encoder.encode('Content-Encoding: nonce\x00'), 12);
	const aesKey = await crypto.subtle.importKey('raw', contentKey, { name: 'AES-GCM' }, false, ['encrypt']);
	// Délimiteur 0x02 : dernier (et seul) enregistrement.
	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv: nonce, tagLength: 128 },
			aesKey,
			concat(encoder.encode(payload), new Uint8Array([2])),
		),
	);

	const header = new Uint8Array(SALT_LENGTH + 5 + senderPublicKey.length);
	header.set(salt, 0);
	new DataView(header.buffer).setUint32(SALT_LENGTH, RECORD_SIZE, false);
	header[SALT_LENGTH + 4] = senderPublicKey.length;
	header.set(senderPublicKey, SALT_LENGTH + 5);
	return concat(header, ciphertext).buffer;
}

/** Jeton VAPID (12 h) pour le service de push de `endpoint`. */
export async function vapidJwt(endpoint: string, subject: string, privateKey: JsonWebKey, now: number): Promise<string> {
	const header = b64url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
	const claims = b64url(encoder.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: now + 12 * 3600, sub: subject })));
	const key = await crypto.subtle.importKey('jwk', privateKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
	// WebCrypto signe déjà au format r||s attendu par JWS : pas de conversion DER.
	const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(`${header}.${claims}`));
	return `${header}.${claims}.${b64url(signature)}`;
}
