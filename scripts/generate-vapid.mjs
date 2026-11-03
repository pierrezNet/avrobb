// Clés VAPID des notifications push, à poser en secrets (wrangler secret put) ou dans .dev.vars.
const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', keys.publicKey)).toString('base64url');
const privateKey = JSON.stringify(await crypto.subtle.exportKey('jwk', keys.privateKey));
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=mailto:dpo@pierrez.net');
