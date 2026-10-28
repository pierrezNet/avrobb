/**
 * Gestionnaire de fichiers (gestionnaire.php) : accès, liste avec le BBCode à insérer, envoi et
 * suppression dans le dossier du lecteur.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { GroupId, type UserProfile } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { buildLegacyCookie } from '../src/services/legacySession.ts';
import { type FakeData, fakeDeps, guest, NOW, viewer } from './fixtures.ts';

const SEED = 'graine-de-test';
const CSRF_SECRET = 'd'.repeat(64);
const cookie = `punbb_cookie=${buildLegacyCookie(3, 'h3', NOW + 3600, SEED)}; punbb_cookie_csrf=${CSRF_SECRET}`;

const tessyProfile: UserProfile = {
	id: 3,
	username: 'Tessy',
	email: 'tessy@example.test',
	emailSetting: 1,
	title: '',
	realname: '',
	url: '',
	location: '',
	jabber: '',
	icq: '',
	msn: '',
	aim: '',
	yahoo: '',
	signature: '',
	biography: '',
	numPosts: 2,
	lastPost: null,
	registered: NOW - 86_400,
	groupId: GroupId.Member,
	groupUserTitle: '',
	groupIsModerator: false,
	acceptsPrivateMessages: true,
};

function data(): FakeData {
	return {
		users: [
			{ viewer: guest, passwordHash: '' },
			{ viewer: viewer(), passwordHash: 'h3' },
		],
		topics: [],
		posts: new Map(),
		profiles: [tessyProfile],
		profileDetails: new Map([[3, { uploadedBytes: 1500 }]]),
		memberFiles: new Map([
			[
				3,
				[
					{ name: 'vol de nuit.png', size: 1000, modified: NOW - 10 },
					{ name: 'plan.zip', size: 500, modified: NOW - 100 },
				],
			],
		]),
	};
}

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

describe('gestionnaire.php', () => {
	it('refusé aux invités', async () => {
		app = await buildApp(fakeDeps(data()));
		expect((await app.inject('/gestionnaire.php')).statusCode).toBe(403);
	});

	it("liste les fichiers du lecteur avec l'adresse publique et le BBCode à insérer", async () => {
		app = await buildApp(fakeDeps(data()));
		const res = await app.inject({ url: '/gestionnaire.php', headers: { cookie } });
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('value="http://forum.test/img/members/3/vol%20de%20nuit.png" readonly');
		expect(res.body).toContain('data-insert="[img]http://forum.test/img/members/3/vol%20de%20nuit.png[/img]"');
		expect(res.body).toContain('data-insert="[url=http://forum.test/img/members/3/plan.zip]plan[/url]"');
		expect(res.body).toContain('js/insert-into-message.');
	});

	it('envoie et supprime dans son propre dossier', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const form = new FormData();
		form.append('csrf_token', csrfToken(CSRF_SECRET, SEED, 3));
		form.append('fichier', new Blob([new Uint8Array(200)]), 'carte.png');
		const request = new Request('http://x/', { method: 'POST', body: form });
		const sent = await app.inject({
			method: 'POST',
			url: '/gestionnaire.php',
			headers: { cookie, 'content-type': request.headers.get('content-type') ?? '' },
			payload: Buffer.from(await request.arrayBuffer()),
		});
		expect(sent.headers.location).toBe('gestionnaire.php?done=uploaded');
		expect(fake.memberFiles?.get(3)?.map((f) => f.name)).toContain('carte.png');
		expect(fake.uploadedBytes?.get(3)).toBe(1700);

		const body = new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, 3), supprimer: '1', delete: 'plan.zip' });
		const deleted = await app.inject({
			method: 'POST',
			url: '/gestionnaire.php',
			headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
			payload: body.toString(),
		});
		expect(deleted.headers.location).toBe('gestionnaire.php?done=deleted');
		expect(fake.memberFiles?.get(3)?.map((f) => f.name)).not.toContain('plan.zip');
	});

	it('une image envoyée devient du WebP, avec sa variante mobile (aperçu) ; tout part à la suppression', async () => {
		const fake = data();
		app = await buildApp(fakeDeps(fake));
		const pngImage = Buffer.concat([
			Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]),
			Buffer.from('IHDR'),
			Buffer.alloc(13),
		]);
		pngImage.writeUInt32BE(2000, 16);
		pngImage.writeUInt32BE(1500, 20);
		const form = new FormData();
		form.append('csrf_token', csrfToken(CSRF_SECRET, SEED, 3));
		form.append('fichier', new Blob([new Uint8Array(pngImage)]), 'Grande photo.png');
		const request = new Request('http://x/', { method: 'POST', body: form });
		const sent = await app.inject({
			method: 'POST',
			url: '/gestionnaire.php',
			headers: { cookie, 'content-type': request.headers.get('content-type') ?? '' },
			payload: Buffer.from(await request.arrayBuffer()),
		});
		expect(sent.headers.location).toBe('gestionnaire.php?done=uploaded');
		const names = fake.memberFiles?.get(3)?.map((f) => f.name) ?? [];
		const saved = names.find((name) => name.endsWith('.webp') && !name.startsWith('mobile_') && !name.startsWith('mini_')) ?? '';
		expect(saved).toMatch(/^Grande.*photo\.webp$/);
		expect(names).toContain(`mobile_${saved}`);
		expect(names).not.toContain(`mini_${saved}`);
		const stored = fake.memberFiles?.get(3)?.find((f) => f.name === saved);
		expect(stored?.data?.toString()).toBe(`webp1024:${pngImage.length}`);
		// L'espace occupé compte l'image enregistrée seulement.
		expect(fake.uploadedBytes?.get(3)).toBe(1500 + `webp1024:${pngImage.length}`.length);

		const listing = await app.inject({ url: '/gestionnaire.php', headers: { cookie } });
		expect(listing.body).not.toContain(`value="mobile_${saved}"`);
		expect(listing.body).toContain(`/mobile_${saved}"`);

		const body = new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, 3), supprimer: '1', delete: saved });
		await app.inject({
			method: 'POST',
			url: '/gestionnaire.php',
			headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
			payload: body.toString(),
		});
		expect((fake.memberFiles?.get(3) ?? []).map((f) => f.name).filter((name) => name.includes(saved))).toEqual([]);
	});
});
