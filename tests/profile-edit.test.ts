/**
 * Modification d'un profil (lot 4) : règles des sections (services/profileForms.ts), avatars,
 * Uploadile, droits, et pages de profile.php de bout en bout avec les doublures.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { GroupId, type UploadSettings, type UserProfile } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { parseMultipartBody } from '../src/http/forms.ts';
import { renameInList } from '../src/repositories/ProfileRepository.ts';
import { checkAvatar, readImageInfo } from '../src/services/images.ts';
import { buildLegacyCookie, punHash } from '../src/services/legacySession.ts';
import { validWebsiteUrl } from '../src/services/links.ts';
import { fileSize } from '../src/services/numberFormat.ts';
import { canChangeEmail, canChangePassword, canUsePrivatePlugiles } from '../src/services/permissions.ts';
import {
	forbiddenTitles,
	readBiography,
	readDisplay,
	readEssentials,
	readMessaging,
	readPersonal,
	readPrivacy,
	readSignature,
} from '../src/services/profileForms.ts';
import { checkUpload, cleanFileName, datedFileName, isListedUpload, uploadLimits, usedPercent } from '../src/services/uploads.ts';
import { boardConfig, type FakeData, fakeDeps, group, guest, NOW, viewer } from './fixtures.ts';

const SEED = 'graine-de-test';
const CSRF_SECRET = 'a'.repeat(64);

// ——— Services ———

describe('validWebsiteUrl (url_valid())', () => {
	it('complète « www. » et refuse les schémas et hôtes invalides', () => {
		expect(validWebsiteUrl('www.pilote-virtuel.com')).toBe('https://www.pilote-virtuel.com');
		expect(validWebsiteUrl('http://example.fr/page?a=1#x')).toBe('http://example.fr/page?a=1#x');
		expect(validWebsiteUrl('ftp.example.org')).toBe('ftp://ftp.example.org');
		expect(validWebsiteUrl('javascript:alert(1)')).toBeNull();
		expect(validWebsiteUrl('http://user:pass@example.fr')).toBeNull();
		expect(validWebsiteUrl('http://exa mple.fr')).toBeNull();
		expect(validWebsiteUrl('http://example.f')).toBeNull();
		expect(validWebsiteUrl('http://example.fr/"onmouseover')).toBeNull();
	});
});

describe('readEssentials', () => {
	const context = {
		isAnyModerator: false,
		isAdmin: false,
		canRename: false,
		emailEditable: true,
		currentUsername: 'Tessy',
		currentEmail: 'tessy@example.com',
		guestLabel: 'Invité',
		bans: [],
		censor: null,
		similarUsername: null,
		emailOwners: [],
		allowBannedEmail: false,
		allowDupeEmail: false,
	};
	const input = { timezone: '2', dst: true, username: 'Autre', email: ' Tessy@Example.com ', adminNote: 'note', numPosts: '9' };

	it("un membre ne change que fuseau, heure d'été et adresse", () => {
		const result = readEssentials(input, context);
		expect(result.changes).toEqual({ timezone: 2, dst: true, email: 'tessy@example.com' });
		expect(result.rename).toBeNull();
		expect(result.errors).toEqual([]);
	});

	it('fuseau inconnu ramené à 0 ; adresse invalide, déjà prise ou bannie refusée', () => {
		expect(readEssentials({ ...input, timezone: '99' }, context).changes.timezone).toBe(0);
		expect(readEssentials({ ...input, email: 'pas-une-adresse' }, context).errors).toEqual([{ kind: 'invalidEmail' }]);
		expect(readEssentials({ ...input, email: 'pris@example.com' }, { ...context, emailOwners: ['MaxDUO'] }).errors).toEqual([
			{ kind: 'dupeEmail' },
		]);
	});

	it('un administrateur renomme, corrige les messages et la note ; un pseudo ressemblant est refusé', () => {
		const admin = { ...context, isAnyModerator: true, isAdmin: true, canRename: true };
		const result = readEssentials(input, admin);
		expect(result.rename).toBe('Autre');
		expect(result.changes).toMatchObject({ adminNote: 'note', numPosts: 9 });
		expect(readEssentials(input, { ...admin, similarUsername: 'autre' }).errors).toEqual([{ kind: 'usernameDupe', existing: 'autre' }]);
		expect(readEssentials({ ...input, username: 'x' }, admin).errors).toEqual([{ kind: 'username', error: 'tooShort' }]);
	});
});

describe('readPersonal, readMessaging', () => {
	const personal = { isAdmin: false, canSetTitle: true, canPostLinks: true, forbiddenTitles: forbiddenTitles(['Membre', 'Modérateur']) };

	it('valide le site web et refuse les titres réservés', () => {
		const result = readPersonal({ realname: ' Val ', title: 'Pilote', location: 'Lyon', url: 'www.val.fr' }, personal);
		expect(result.changes).toEqual({ realname: 'Val', location: 'Lyon', url: 'https://www.val.fr', title: 'Pilote' });
		expect(readPersonal({ realname: '', title: 'modérateur', location: '', url: '' }, personal).errors).toEqual([
			{ kind: 'forbiddenTitle' },
		]);
		expect(readPersonal({ realname: '', title: '', location: '', url: 'nimporte quoi' }, personal).errors).toEqual([
			{ kind: 'invalidWebsite' },
		]);
		expect(readPersonal({ realname: '', title: '', location: '', url: 'www.a.fr' }, { ...personal, canPostLinks: false }).errors).toEqual([
			{ kind: 'websiteNotAllowed' },
		]);
	});

	it('sans g_set_title, le titre est ignoré ; longueurs contrôlées', () => {
		expect(
			readPersonal({ realname: '', title: 'X', location: '', url: '' }, { ...personal, canSetTitle: false }).changes.title,
		).toBeUndefined();
		expect(readPersonal({ realname: 'a'.repeat(41), title: '', location: '', url: '' }, personal).errors).toEqual([
			{ kind: 'tooLong', field: 'realname', max: 40 },
		]);
	});

	it("un UIN ICQ n'a que des chiffres", () => {
		expect(readMessaging({ jabber: '', icq: '12a', msn: '', aim: '', yahoo: '' }).errors).toEqual([{ kind: 'badIcq' }]);
		expect(readMessaging({ jabber: 'j@x', icq: '123', msn: '', aim: '', yahoo: '' }).changes).toMatchObject({ jabber: 'j@x', icq: '123' });
	});
});

describe('readSignature', () => {
	const context = {
		maxLength: 20,
		maxLines: 2,
		allowAllCaps: false,
		bbcode: true,
		isAnyModerator: false,
		preparse: { quoteDepth: 3, makeLinks: false, allowLinks: true, indentSpaces: 4, baseUrl: 'http://forum.test' },
	};

	it('longueur, nombre de lignes, capitales et BBCode des signatures', () => {
		expect(readSignature('a'.repeat(25), context).errors).toEqual([{ kind: 'signatureTooLong', max: 20, excess: 5 }]);
		expect(readSignature('a\nb\nc', context).errors).toEqual([{ kind: 'signatureTooManyLines', max: 2 }]);
		expect(readSignature('BONS VOLS', context).signature).toBe('Bons Vols');
		expect(readSignature('[B]Salut[/B]', context).signature).toBe('[b]Salut[/b]');
		expect(readSignature('[quote]x[/quote]', context).errors.map((e) => e.kind)).toEqual(['bbcode']);
		expect(readSignature('[b][/b]', context)).toMatchObject({ signature: '', errors: [] });
	});
});

describe('readDisplay, readPrivacy', () => {
	const all = { smilies: true, signatures: true, avatars: true, images: true, signatureImages: true, reputation: false };
	const input = {
		style: 'GreenDark',
		showSmilies: false,
		showSignatures: true,
		showAvatars: false,
		showImages: true,
		showSignatureImages: false,
		topicsPerPage: '100',
		postsPerPage: '',
		reputationEnabled: false,
	};

	it('bornes de pagination, thème connu, et seulement les cases affichées', () => {
		const { changes } = readDisplay(input, all);
		expect(changes).toMatchObject({ style: 'GreenDark', topicsPerPage: 75, postsPerPage: null, showSmilies: false });
		// Renommée désactivée : reputation_enable n'est pas remis à 0 (écart avec le PHP).
		expect(changes.reputationEnabled).toBeUndefined();
		expect(readDisplay({ ...input, style: '../etc', topicsPerPage: '1' }, all).changes).toMatchObject({ topicsPerPage: 3 });
		expect(readDisplay({ ...input, style: '../etc' }, all).changes.style).toBeUndefined();
	});

	it('messagerie désactivée : use_pm est conservé', () => {
		const options = {
			subscriptions: true,
			autoNotify: true,
			privateMessages: false,
			privateMessageNotification: false,
			defaultEmailSetting: 1,
		};
		const input = {
			emailSetting: '7',
			notifyWithPost: true,
			autoNotify: false,
			usesPrivateMessages: false,
			notifyPrivateMessages: false,
			notifyPrivateMessagesFull: false,
		};
		expect(readPrivacy(input, options).changes).toEqual({ emailSetting: 1, notifyWithPost: true, autoNotify: false });
		expect(readPrivacy(input, { ...options, privateMessages: true }).changes.usesPrivateMessages).toBe(false);
	});
});

describe('readBiography', () => {
	const context = {
		bbcode: true,
		messageAllCaps: false,
		isModeratorGroup: false,
		preparse: { quoteDepth: 3, makeLinks: false, allowLinks: true, indentSpaces: 4, baseUrl: 'http://forum.test' },
	};
	it('nettoie le BBCode, refuse les erreurs et les textes trop longs', () => {
		expect(readBiography(' [B]Pilote[/B]\r\n', context)).toEqual({ biography: '[b]Pilote[/b]', errors: [] });
		expect(readBiography('[b]x', context).errors).toHaveLength(1);
		expect(readBiography('é'.repeat(40_000), context).errors).toEqual(['tooLong']);
		expect(readBiography('', context)).toEqual({ biography: '', errors: [] });
	});
});

// Images minimales : en-têtes suffisants pour getimagesize().
const png = (width: number, height: number): Buffer => {
	const data = Buffer.alloc(33);
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(data);
	data.writeUInt32BE(13, 8);
	data.write('IHDR', 12, 'latin1');
	data.writeUInt32BE(width, 16);
	data.writeUInt32BE(height, 20);
	return data;
};
const gif = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.from([40, 0, 30, 0, 0, 0, 0])]);
const jpeg = Buffer.from([
	0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x32, 0x00, 0x48, 0x01, 0x01, 0x11, 0x00,
]);

describe('images (getimagesize())', () => {
	it('lit le type et les dimensions dans le contenu', () => {
		expect(readImageInfo(png(60, 50))).toEqual({ type: 'png', width: 60, height: 50 });
		expect(readImageInfo(gif)).toEqual({ type: 'gif', width: 40, height: 30 });
		expect(readImageInfo(jpeg)).toEqual({ type: 'jpg', width: 72, height: 50 });
		expect(readImageInfo(Buffer.from('<?php echo 1; ?>'))).toBeNull();
	});

	it('contrôles des avatars : type, poids, dimensions', () => {
		const limits = { maxBytes: 100, maxWidth: 60, maxHeight: 60 };
		expect(checkAvatar(png(60, 60), limits)).toEqual({ image: { type: 'png', width: 60, height: 60 } });
		expect(checkAvatar(png(61, 10), limits)).toEqual({ error: { kind: 'tooWideOrHigh', width: 60, height: 60 } });
		expect(checkAvatar(Buffer.alloc(0), limits)).toEqual({ error: { kind: 'noFile' } });
		expect(checkAvatar(Buffer.from('texte'), limits)).toEqual({ error: { kind: 'badType' } });
		expect(checkAvatar(Buffer.concat([png(10, 10), Buffer.alloc(100)]), limits)).toEqual({ error: { kind: 'tooLarge', max: 100 } });
	});
});

describe('Uploadile (règles)', () => {
	const settings: UploadSettings = boardConfig.uploads;

	it('espace par groupe et pourcentage utilisé', () => {
		expect(uploadLimits(GroupId.Admin, settings).unlimited).toBe(true);
		expect(uploadLimits(GroupId.Moderator, settings)).toMatchObject({ quota: 5_000_000, maxFileSize: 1_000_000 });
		expect(uploadLimits(GroupId.Member, settings)).toMatchObject({ quota: 1_000_000, maxFileSize: 200_000 });
		expect(usedPercent(250_001, 1_000_000)).toBe(26);
		expect(usedPercent(10, 0)).toBe(100);
	});

	it('nom nettoyé, un seul point, extension permise et non dangereuse, taille et espace', () => {
		const limits = uploadLimits(GroupId.Member, settings);
		expect(checkUpload({ name: "Mon vol d'été.jpg", size: 10 }, 0, limits, settings)).toEqual({ fileName: 'Mon-vol-d-ete.jpg' });
		expect(checkUpload({ name: 'photo.JPG', size: 10 }, 0, limits, settings)).toEqual({ fileName: 'photo.JPG' });
		expect(checkUpload({ name: 'photo.Jpg', size: 10 }, 0, limits, settings)).toEqual({ error: 'badExtension' });
		expect(checkUpload({ name: 'shell.php.jpg', size: 10 }, 0, limits, settings)).toEqual({ error: 'multipleDots' });
		expect(checkUpload({ name: 'shell.php', size: 10 }, 0, limits, { ...settings, extensions: ['php'] })).toEqual({
			error: 'badExtension',
		});
		expect(checkUpload({ name: 'a.jpg', size: 200_001 }, 0, limits, settings)).toEqual({ error: 'tooLarge' });
		expect(checkUpload({ name: 'a.jpg', size: 100 }, 999_950, limits, settings)).toEqual({ error: 'quotaExceeded' });
		expect(cleanFileName('<script>#')).toBe('script');
		expect(datedFileName('a.jpg', Date.UTC(2026, 9, 25, 14, 5) / 1000)).toBe('25102026-1405_a.jpg');
	});

	it('fichiers listés : ni cachés, ni miniatures, ni extensions refusées', () => {
		expect(isListedUpload('vol.PNG', settings)).toBe(true);
		expect(isListedUpload('#cache.png', settings)).toBe(false);
		expect(isListedUpload('mini_vol.png', settings)).toBe(false);
		expect(isListedUpload('notes.txt', settings)).toBe(false);
		expect(fileSize(10_240)).toBe('10 Kio');
		expect(fileSize(500)).toBe('500 O');
	});

	it('renomme un destinataire de MP élément par élément', () => {
		expect(renameInList('Max, MaxDUO, Tessy', 'Max', 'Maxime')).toBe('Maxime, MaxDUO, Tessy');
	});
});

describe('droits des actions du profil', () => {
	const member = { id: 6, groupId: GroupId.Member, groupIsModerator: false };
	const mod = viewer({ id: 5, group: group({ id: GroupId.Moderator, isModerator: true, canModEditUsers: true }) });
	it("mot de passe et adresse : soi-même, l'administrateur, un modérateur autorisé", () => {
		expect(canChangePassword(viewer({ id: 6 }), member)).toBe(true);
		expect(canChangePassword(mod, member)).toBe(false);
		expect(canChangePassword(viewer({ ...mod, group: { ...mod.group, canModChangePasswords: true } }), member)).toBe(true);
		expect(canChangeEmail(mod, member)).toBe(true);
		expect(canChangeEmail(mod, { ...member, groupIsModerator: true })).toBe(false);
		expect(canUsePrivatePlugiles(mod, 6)).toBe(false);
		expect(canUsePrivatePlugiles(viewer({ id: 6 }), 6)).toBe(true);
	});
});

describe('formulaires multipart', () => {
	it('sépare champs et fichiers, ignore un champ fichier laissé vide', async () => {
		const boundary = 'limite';
		const part = (headers: string, body: string): string => `--${boundary}\r\n${headers}\r\n\r\n${body}\r\n`;
		const raw =
			part('Content-Disposition: form-data; name="csrf_token"', 'abc') +
			part('Content-Disposition: form-data; name="delete"', 'a.jpg') +
			part('Content-Disposition: form-data; name="delete"', 'b.jpg') +
			part('Content-Disposition: form-data; name="req_file"; filename="avatar.png"\r\nContent-Type: image/png', 'PNG') +
			// Champ fichier sans sélection, tel que l'envoie un navigateur.
			part('Content-Disposition: form-data; name="vide"; filename=""\r\nContent-Type: application/octet-stream', '') +
			`--${boundary}--\r\n`;
		const parsed = await parseMultipartBody(Buffer.from(raw), `multipart/form-data; boundary=${boundary}`);
		expect(parsed.form).toEqual({ csrf_token: 'abc', delete: ['a.jpg', 'b.jpg'] });
		expect([...parsed.files.keys()]).toEqual(['req_file']);
		expect(parsed.files.get('req_file')).toEqual({ name: 'avatar.png', data: Buffer.from('PNG') });
	});
});

// ——— Pages ———

function member(overrides: Partial<UserProfile> = {}): UserProfile {
	return {
		id: 3,
		username: 'Tessy',
		email: 'tessy@example.com',
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
		signature: '[b]Bons vols[/b]',
		biography: '',
		numPosts: 12,
		lastPost: NOW - 600,
		registered: NOW - 86_400,
		groupId: GroupId.Member,
		groupUserTitle: '',
		groupIsModerator: false,
		acceptsPrivateMessages: true,
		...overrides,
	};
}

const tessy = viewer({ group: group({ canSetTitle: true }) });
const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true, canModEditUsers: true }) });
const admin = viewer({ id: 2, username: 'admin', group: group({ id: GroupId.Admin }) });

function data(overrides: Partial<FakeData> = {}): FakeData {
	return {
		users: [
			{ viewer: guest, passwordHash: '' },
			{ viewer: tessy, passwordHash: punHash('ancien-mdp') },
			{ viewer: mod, passwordHash: punHash('mod-mdp') },
			{ viewer: admin, passwordHash: punHash('admin-mdp') },
		],
		topics: [],
		posts: new Map(),
		profiles: [member(), member({ id: 2, username: 'admin', groupId: GroupId.Admin }), member({ id: 6, username: 'valdefsx' })],
		...overrides,
	};
}

const hashOf = (fake: FakeData, userId: number): string => fake.users.find((u) => u.viewer.id === userId)?.passwordHash ?? '';
const cookies = (fake: FakeData, userId: number): string =>
	`punbb_cookie=${buildLegacyCookie(userId, hashOf(fake, userId), NOW + 3600, SEED)}; punbb_cookie_csrf=${CSRF_SECRET}`;

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

async function start(fake: FakeData, config = {}): Promise<FastifyInstance> {
	fake.config = { ...fake.config, ...config };
	app = await buildApp(fakeDeps(fake));
	return app;
}

function get(server: FastifyInstance, fake: FakeData, userId: number, url: string) {
	return server.inject({ url, headers: { cookie: cookies(fake, userId) } });
}

function post(server: FastifyInstance, fake: FakeData, userId: number, url: string, fields: Record<string, string | string[]>) {
	const body = new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, userId) });
	for (const [name, value] of Object.entries(fields)) for (const item of [value].flat()) body.append(name, item);
	return server.inject({
		method: 'POST',
		url,
		headers: { cookie: cookies(fake, userId), 'content-type': 'application/x-www-form-urlencoded' },
		payload: body.toString(),
	});
}

async function postFile(
	server: FastifyInstance,
	fake: FakeData,
	userId: number,
	url: string,
	field: string,
	name: string,
	content: Buffer,
) {
	const form = new FormData();
	form.append('csrf_token', csrfToken(CSRF_SECRET, SEED, userId));
	form.append(field, new Blob([new Uint8Array(content)]), name);
	const request = new Request('http://x/', { method: 'POST', body: form });
	return server.inject({
		method: 'POST',
		url,
		headers: { cookie: cookies(fake, userId), 'content-type': request.headers.get('content-type') ?? '' },
		payload: Buffer.from(await request.arrayBuffer()),
	});
}

describe('profile.php : sections', () => {
	it('son propre profil ouvre la section Principal, avec le menu et les plugiles', async () => {
		const fake = data();
		const server = await start(fake);
		const res = await get(server, fake, 3, '/profile.php?id=3');
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('<h1 class="page-title">Tessy - Principal</h1>');
		expect(res.body).toContain('href="profile.php?section=essentials&amp;id=3" aria-current="page"');
		expect(res.body).toContain('href="profile.php?plugin=UPP_Suivile.php&amp;id=3"');
		expect(res.body).toContain('name="req_email" value="tessy@example.com"');
		expect(res.body).toContain('href="profile.php?action=change_pass&amp;id=3"');
		expect(res.body).not.toContain('admin_note');
		expect(res.body).not.toContain('section=admin');
	});

	it("le profil d'un autre reste en consultation, quelle que soit la section demandée", async () => {
		const fake = data();
		const server = await start(fake);
		const res = await get(server, fake, 3, '/profile.php?section=personal&id=6');
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('Profil de valdefsx');
		expect(res.body).not.toContain('name="form[realname]"');
		const forbidden = await post(server, fake, 3, '/profile.php?section=personal&id=6', { form_sent: '1', 'form[realname]': 'X' });
		expect(forbidden.statusCode).toBe(403);
		expect(fake.profileUpdates).toBeUndefined();
	});

	it('enregistre une section et redirige avec un avis ; les erreurs réaffichent la saisie', async () => {
		const fake = data();
		const server = await start(fake);
		const ok = await post(server, fake, 3, '/profile.php?section=personal&id=3', {
			form_sent: '1',
			'form[realname]': 'Tess',
			title: 'Pilote',
			'form[location]': 'Lyon',
			'form[url]': 'www.tess.fr',
		});
		expect(ok.statusCode).toBe(303);
		expect(ok.headers.location).toBe('profile.php?section=personal&id=3&updated=1');
		expect(fake.profileUpdates).toEqual([
			{ id: 3, changes: { realname: 'Tess', location: 'Lyon', url: 'https://www.tess.fr', title: 'Pilote' } },
		]);
		expect((await get(server, fake, 3, '/profile.php?section=personal&id=3&updated=1')).body).toContain('Profil mis à jour.');

		const bad = await post(server, fake, 3, '/profile.php?section=personal&id=3', {
			form_sent: '1',
			'form[realname]': '<Tess>',
			'form[url]': 'javascript:alert(1)',
		});
		expect(bad.statusCode).toBe(200);
		expect(bad.body).toContain('L&#39;URL de site Web saisie est invalide.');
		expect(bad.body).toContain('value="&lt;Tess&gt;"');
		expect(fake.profileUpdates).toHaveLength(1);
	});

	it('refuse un formulaire sans jeton CSRF', async () => {
		const fake = data();
		const server = await start(fake);
		const res = await server.inject({
			method: 'POST',
			url: '/profile.php?section=messaging&id=3',
			headers: { cookie: cookies(fake, 3), 'content-type': 'application/x-www-form-urlencoded' },
			payload: 'form_sent=1&form%5Bicq%5D=1',
		});
		expect(res.statusCode).toBe(403);
		expect(fake.profileUpdates).toBeUndefined();
	});

	it('un modérateur autorisé modifie un membre, mais pas un administrateur ; Administration reste en PHP', async () => {
		const fake = data();
		const server = await start(fake);
		const res = await get(server, fake, 5, '/profile.php?id=6');
		expect(res.body).toContain('valdefsx - Principal');
		expect(res.body).toContain('name="admin_note"');
		expect(res.body).toContain('moderate.php?get_host=192.0.2.7');
		expect((await get(server, fake, 5, '/profile.php?id=2')).body).toContain('Profil de admin');

		const asAdmin = await get(server, fake, 2, '/profile.php?section=admin&id=6');
		expect(asAdmin.statusCode).toBe(302);
		expect(asAdmin.headers.location).toBe('http://php.test/profile.php?section=admin&id=6');
	});

	it("l'administrateur renomme : effets de bord et caches PHP", async () => {
		const fake = data({ bans: [{ id: 1, username: 'valdefsx', ip: '', email: '', message: '', expire: null }] });
		const invalidated: string[] = [];
		app = await buildApp(
			fakeDeps(fake, {
				phpCache: {
					version: async () => null,
					read: async () => null,
					invalidate: async (name) => void invalidated.push(name),
					invalidateFamily: async () => {},
				},
			}),
		);
		const res = await post(app, fake, 2, '/profile.php?section=essentials&id=6', {
			form_sent: '1',
			req_username: 'Valentin',
			req_email: 'val@example.com',
			'form[timezone]': '1',
			num_posts: '40',
			admin_note: '',
		});
		expect(res.statusCode).toBe(303);
		expect(fake.renames).toEqual([{ id: 6, from: 'valdefsx', to: 'Valentin' }]);
		expect(fake.profileUpdates?.[0]?.changes).toMatchObject({ numPosts: 40, email: 'val@example.com' });
		expect(invalidated).toEqual(['users_info', 'bans']);
	});

	it('Affichage et Vie privée : thèmes, cases conditionnelles', async () => {
		const fake = data();
		const server = await start(fake, { privateMessagesEnabled: true });
		const display = await get(server, fake, 3, '/profile.php?section=display&id=3');
		expect(display.body).toContain('<option value="GreenDark">GreenDark</option>');
		expect(display.body).not.toContain('reputation_enable');
		const privacy = await get(server, fake, 3, '/profile.php?section=privacy&id=3');
		expect(privacy.body).toContain('name="form[use_pm]" value="1" checked');
		expect(privacy.body).not.toContain('notify_pm_full');
	});

	it('Personnalité : aperçu de la signature et liens de l’avatar', async () => {
		const fake = data();
		const server = await start(fake, { avatars: true });
		const res = await get(server, fake, 3, '/profile.php?section=personality&id=3');
		expect(res.body).toContain('<strong>Bons vols</strong>');
		expect(res.body).toContain('profile.php?action=upload_avatar&amp;id=3');
		expect(res.body).toContain('400 caractères et 4 lignes autorisés');
	});
});

describe('profile.php : mot de passe et adresse', () => {
	it("change son mot de passe avec l'ancien, et renouvelle le cookie", async () => {
		const fake = data();
		const server = await start(fake);
		const wrong = await post(server, fake, 3, '/profile.php?action=change_pass&id=3', {
			req_old_password: 'faux',
			req_new_password1: 'nouveau-mdp',
			req_new_password2: 'nouveau-mdp',
		});
		expect(wrong.body).toContain('Ancien mot de passe incorrect.');

		const ok = await post(server, fake, 3, '/profile.php?action=change_pass&id=3', {
			req_old_password: 'ancien-mdp',
			req_new_password1: 'nouveau-mdp',
			req_new_password2: 'nouveau-mdp',
		});
		expect(ok.statusCode).toBe(303);
		expect(fake.passwordHashes?.get(3)).toBe(punHash('nouveau-mdp'));
		expect([ok.headers['set-cookie']].flat().join()).toContain('punbb_cookie=3|');
	});

	it("un modérateur sans g_mod_change_passwords n'y a pas accès", async () => {
		const fake = data();
		const server = await start(fake);
		expect((await get(server, fake, 5, '/profile.php?action=change_pass&id=6')).statusCode).toBe(403);
	});

	it("lien d'activation d'un mot de passe oublié, pour un invité", async () => {
		const fake = data({ pendingActivations: new Map([[3, { value: punHash('x'), key: 'abcd1234' }]]) });
		const server = await start(fake);
		expect((await server.inject('/profile.php?action=change_pass&id=3&key=mauvaise')).statusCode).toBe(400);
		const ok = await server.inject('/profile.php?action=change_pass&id=3&key=abcd1234');
		expect(ok.statusCode).toBe(200);
		expect(ok.body).toContain('Votre mot de passe a été mis à jour.');
		expect(fake.activationLog).toEqual(['password 3']);
	});

	it("changement d'adresse : mot de passe, e-mail d'activation, puis lien", async () => {
		const fake = data();
		const server = await start(fake);
		const wrong = await post(server, fake, 3, '/profile.php?action=change_email&id=3', {
			req_new_email: 'neuve@example.com',
			req_password: 'x',
		});
		expect(wrong.body).toContain('Mot de passe incorrect.');

		const ok = await post(server, fake, 3, '/profile.php?action=change_email&id=3', {
			req_new_email: 'Neuve@Example.com',
			req_password: 'ancien-mdp',
		});
		expect(ok.statusCode).toBe(200);
		const pending = fake.pendingActivations?.get(3);
		expect(pending?.value).toBe('neuve@example.com');
		expect(fake.sentMails?.[0]?.to).toBe('neuve@example.com');
		expect(fake.sentMails?.[0]?.text).toContain(`profile.php?action=change_email&id=3&key=${pending?.key}`);

		const activated = await get(server, fake, 3, `/profile.php?action=change_email&id=3&key=${pending?.key}`);
		expect(activated.body).toContain('Votre adresse électronique a été mise à jour.');
		expect(fake.activationLog).toEqual(['email 3']);
	});
});

describe('profile.php : avatar', () => {
	it('envoie un avatar contrôlé sur son contenu, et refuse un faux', async () => {
		const fake = data();
		const server = await start(fake, { avatars: true });
		const form = await get(server, fake, 3, '/profile.php?action=upload_avatar&id=3');
		expect(form.body).toContain('enctype="multipart/form-data"');

		const ok = await postFile(server, fake, 3, '/profile.php?action=upload_avatar2&id=3', 'req_file', 'moi.png', png(50, 50));
		expect(ok.statusCode).toBe(303);
		expect(fake.avatarLog).toEqual(['save 3.png']);

		const bad = await postFile(server, fake, 3, '/profile.php?action=upload_avatar2&id=3', 'req_file', 'moi.png', Buffer.from('<?php'));
		expect(bad.body).toContain('Ce type de fichier n&#39;est pas autorisé');
		expect(fake.avatarLog).toHaveLength(1);
	});

	it("efface l'avatar après confirmation (POST)", async () => {
		const fake = data();
		const server = await start(fake, { avatars: true });
		const confirm = await get(server, fake, 3, '/profile.php?action=delete_avatar&id=3');
		expect(confirm.body).toContain('action="profile.php?action=delete_avatar&amp;id=3"');
		expect(fake.avatarLog).toBeUndefined();
		expect((await post(server, fake, 3, '/profile.php?action=delete_avatar&id=3', {})).statusCode).toBe(303);
		expect(fake.avatarLog).toEqual(['delete 3']);
	});

	it('avatars désactivés : action refusée', async () => {
		const fake = data();
		const server = await start(fake, { avatars: false });
		expect((await get(server, fake, 3, '/profile.php?action=upload_avatar&id=3')).statusCode).toBe(404);
	});
});

describe('profile.php : plugiles', () => {
	it('Ma biographie : modification, aperçu, et consultation pour les autres', async () => {
		const fake = data();
		const server = await start(fake);
		const res = await post(server, fake, 3, '/profile.php?plugin=UP_Ma_biographie.php&id=3', { req_message: 'Pilote [B]FS98[/B]' });
		expect(res.statusCode).toBe(303);
		expect(fake.profileUpdates).toEqual([{ id: 3, changes: { biography: 'Pilote [b]FS98[/b]' } }]);
		const page = await get(server, fake, 3, '/profile.php?plugin=UP_Ma_biographie.php&id=3&updated=saved');
		expect(page.body).toContain('Pilote <strong>FS98</strong>');
		expect(page.body).toContain('Profil mis à jour.');
		expect((await get(server, fake, 3, '/profile.php?plugin=UP_Ma_biographie.php&id=6')).body).toContain('Profil de valdefsx');
	});

	it('Suivile : liste et désabonnement, réservé au membre et aux administrateurs', async () => {
		const fake = data({
			subscribedTopicList: [
				{
					id: 10,
					forumId: 1,
					poster: 'MaxDUO',
					subject: 'Vol de nuit',
					posted: NOW - 9000,
					lastPost: { postedAt: NOW - 60, postId: 99, poster: 'MaxDUO' },
					numViews: 3,
					numReplies: 1,
					closed: false,
					sticky: false,
					movedTo: null,
					hasPosted: false,
				},
			],
		});
		const server = await start(fake);
		const list = await get(server, fake, 3, '/profile.php?plugin=UPP_Suivile.php&id=3');
		expect(list.body).toContain('Vol de nuit');
		expect(list.body).toContain('name="topics" value="10"');
		expect(list.body).toContain('Sélectionner « Vol de nuit »');

		expect((await post(server, fake, 3, '/profile.php?plugin=UPP_Suivile.php&id=3', {})).body).toContain(
			'Vous devez choisir au moins une discussion',
		);
		const done = await post(server, fake, 3, '/profile.php?plugin=UPP_Suivile.php&id=3', { topics: ['10', 'x'] });
		expect(done.statusCode).toBe(303);
		expect(fake.unsubscribed).toEqual([{ userId: 3, topicIds: [10] }]);

		// Un modérateur qui peut modifier le profil n'accède pas aux plugiles privés.
		expect((await get(server, fake, 5, '/profile.php?plugin=UPP_Suivile.php&id=6')).statusCode).toBe(403);
		expect((await get(server, fake, 2, '/profile.php?plugin=UPP_Suivile.php&id=6')).statusCode).toBe(200);
	});

	it('Mes uploads : envoi, nom déjà pris, suppression et espace recalculé', async () => {
		const fake = data({
			memberFiles: new Map([
				[
					3,
					[
						{ name: 'vol.jpg', size: 1000, modified: NOW - 100 },
						{ name: 'mini_vol.jpg', size: 10, modified: NOW - 100 },
						{ name: '#prive.jpg', size: 5, modified: NOW },
					],
				],
			]),
			profileDetails: new Map([[3, { uploadedBytes: 1000 }]]),
		});
		const server = await start(fake);
		const page = await get(server, fake, 3, '/profile.php?plugin=UPP_Mes_uploads.php&id=3');
		expect(page.body).toContain('href="http://php.test/img/members/3/vol.jpg">vol</a> [1000 O] [jpg]');
		expect(page.body).not.toContain('prive');
		expect(page.body).toContain('Votre fichier ne doit pas dépasser les 195.31 Kio et doit être de type : jpg, png, zip.');

		const sent = await postFile(server, fake, 3, '/profile.php?plugin=UPP_Mes_uploads.php&id=3', 'fichier', 'vol.jpg', Buffer.alloc(300));
		expect(sent.statusCode).toBe(303);
		expect(fake.memberFiles?.get(3)?.map((f) => f.name)).toContain(datedFileName('vol.jpg', NOW));
		expect(fake.uploadedBytes?.get(3)).toBe(1300);

		const refused = await postFile(server, fake, 3, '/profile.php?plugin=UPP_Mes_uploads.php&id=3', 'fichier', 'a.php', Buffer.alloc(3));
		expect(refused.body).toContain('cette extension n&#39;est pas acceptée');

		const deleted = await post(server, fake, 3, '/profile.php?plugin=UPP_Mes_uploads.php&id=3', {
			supprimer: '1',
			delete: ['vol.jpg', '../../config.php'],
		});
		expect(deleted.headers.location).toBe('profile.php?plugin=UPP_Mes_uploads.php&id=3&updated=deleteFailed');
		expect(fake.memberFiles?.get(3)?.map((f) => f.name)).not.toContain('vol.jpg');
		expect(fake.uploadedBytes?.get(3)).toBe(300);
	});
});
