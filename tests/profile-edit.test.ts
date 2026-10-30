/**
 * Modification d'un profil : règles des sections (services/profileForms.ts), avatars, et pages de
 * profile.php de bout en bout avec les doublures.
 */

import { describe, expect, it } from 'vitest';
import { buildApp, type ForumApp } from '../src/app.ts';
import { GroupId, type UserProfile } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { parseMultipartBody } from '../src/http/forms.ts';
import { renameInList } from '../src/repositories/ProfileRepository.ts';
import { checkAvatar, readImageInfo } from '../src/services/images.ts';
import { validWebsiteUrl } from '../src/services/links.ts';
import { fileSize } from '../src/services/numberFormat.ts';
import {
	forbiddenTitles,
	readDisplay,
	readEssentials,
	readMessaging,
	readPersonal,
	readPrivacy,
	readSignature,
} from '../src/services/profileForms.ts';
import { type FakeData, fakeDeps, group, guest, NOW, sessionCookie, viewer } from './fixtures.ts';
import { inject } from './inject.ts';

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
		currentUsername: 'Tessy',
		currentEmail: 'tessy@example.com',
		guestLabel: 'Invité',
		bans: [],
		censor: null,
		similarUsername: null,
		emailOwners: [],
		allowBannedEmail: false,
		allowDupeEmail: false,
		selfRename: false,
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
		// Un administrateur qui renomme ne consomme pas le changement unique du membre.
		expect(result.changes.usernameChanged).toBeUndefined();
	});

	it('le membre change lui-même son pseudo une fois ; adresse facultative', () => {
		const self = { ...context, canRename: true, selfRename: true };
		const result = readEssentials(input, self);
		expect(result.rename).toBe('Autre');
		expect(result.changes.usernameChanged).toBe(true);
		expect(result.changes.adminNote).toBeUndefined();
		// Même pseudo : rien n'est consommé.
		expect(readEssentials({ ...input, username: 'Tessy' }, self).changes.usernameChanged).toBeUndefined();
		expect(readEssentials({ ...input, email: '' }, context)).toMatchObject({ errors: [], changes: { email: '' } });
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

describe('utilitaires du profil', () => {
	it('taille lisible', () => {
		expect(fileSize(10_240)).toBe('10 Kio');
		expect(fileSize(500)).toBe('500 O');
	});

	it('renomme un destinataire de MP élément par élément', () => {
		expect(renameInList('Max, MaxDUO, Tessy', 'Max', 'Maxime')).toBe('Maxime, MaxDUO, Tessy');
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
		users: [{ viewer: guest }, { viewer: tessy }, { viewer: mod }, { viewer: admin }],
		topics: [],
		posts: new Map(),
		profiles: [member(), member({ id: 2, username: 'admin', groupId: GroupId.Admin }), member({ id: 6, username: 'valdefsx' })],
		...overrides,
	};
}

const cookies = (userId: number): string => `${sessionCookie(userId)}; avrobb_csrf=${CSRF_SECRET}`;

let app: ForumApp | undefined;

async function start(fake: FakeData, config = {}): Promise<ForumApp> {
	fake.config = { ...fake.config, ...config };
	app = await buildApp(fakeDeps(fake));
	return app;
}

function get(server: ForumApp, userId: number, url: string) {
	return inject(server, { url, headers: { cookie: cookies(userId) } });
}

function post(server: ForumApp, userId: number, url: string, fields: Record<string, string | string[]>) {
	const body = new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, userId) });
	for (const [name, value] of Object.entries(fields)) for (const item of [value].flat()) body.append(name, item);
	return inject(server, {
		method: 'POST',
		url,
		headers: { cookie: cookies(userId), 'content-type': 'application/x-www-form-urlencoded' },
		payload: body.toString(),
	});
}

async function postFile(server: ForumApp, userId: number, url: string, field: string, name: string, content: Buffer) {
	const form = new FormData();
	form.append('csrf_token', csrfToken(CSRF_SECRET, SEED, userId));
	form.append(field, new Blob([new Uint8Array(content)]), name);
	const request = new Request('http://x/', { method: 'POST', body: form });
	return inject(server, {
		method: 'POST',
		url,
		headers: { cookie: cookies(userId), 'content-type': request.headers.get('content-type') ?? '' },
		payload: Buffer.from(await request.arrayBuffer()),
	});
}

describe('profile.php : sections', () => {
	it('son propre profil ouvre la section Principal, avec le menu', async () => {
		const fake = data();
		const server = await start(fake);
		const res = await get(server, 3, '/profile.php?id=3');
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('<h1 class="page-title">Tessy - Principal</h1>');
		expect(res.body).toContain('href="/profile.php?section=essentials&amp;id=3" aria-current="page"');
		expect(res.body).toContain('name="req_email" value="tessy@example.com"');
		expect(res.body).not.toContain('admin_note');
		expect(res.body).not.toContain('section=admin');
	});

	it("le profil d'un autre reste en consultation, quelle que soit la section demandée", async () => {
		const fake = data();
		const server = await start(fake);
		const res = await get(server, 3, '/profile.php?section=personal&id=6');
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('Profil de valdefsx');
		expect(res.body).not.toContain('name="form[realname]"');
		const forbidden = await post(server, 3, '/profile.php?section=personal&id=6', { form_sent: '1', 'form[realname]': 'X' });
		expect(forbidden.statusCode).toBe(403);
		expect(fake.profileUpdates).toBeUndefined();
	});

	it('enregistre une section et redirige avec un avis ; les erreurs réaffichent la saisie', async () => {
		const fake = data();
		const server = await start(fake);
		const ok = await post(server, 3, '/profile.php?section=personal&id=3', {
			form_sent: '1',
			'form[realname]': 'Tess',
			title: 'Pilote',
			'form[location]': 'Lyon',
			'form[url]': 'www.tess.fr',
		});
		expect(ok.statusCode).toBe(303);
		expect(ok.headers.location).toBe('/profile.php?section=personal&id=3&updated=1');
		expect(fake.profileUpdates).toEqual([
			{ id: 3, changes: { realname: 'Tess', location: 'Lyon', url: 'https://www.tess.fr', title: 'Pilote' } },
		]);
		expect((await get(server, 3, '/profile.php?section=personal&id=3&updated=1')).body).toContain('Profil mis à jour.');

		const bad = await post(server, 3, '/profile.php?section=personal&id=3', {
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
		const res = await inject(server, {
			method: 'POST',
			url: '/profile.php?section=messaging&id=3',
			headers: { cookie: cookies(3), 'content-type': 'application/x-www-form-urlencoded' },
			payload: 'form_sent=1&form%5Bicq%5D=1',
		});
		expect(res.statusCode).toBe(403);
		expect(fake.profileUpdates).toBeUndefined();
	});

	it('un modérateur autorisé modifie un membre, mais pas un administrateur ; plus de section Administration', async () => {
		const fake = data();
		const server = await start(fake);
		const res = await get(server, 5, '/profile.php?id=6');
		expect(res.body).toContain('valdefsx - Principal');
		expect(res.body).toContain('name="admin_note"');
		expect(res.body).toContain('moderate.php?get_host=192.0.2.7');
		expect((await get(server, 5, '/profile.php?id=2')).body).toContain('Profil de admin');

		expect((await get(server, 2, '/profile.php?section=admin&id=6')).statusCode).toBe(404);
	});

	it("l'administrateur renomme : effets de bord", async () => {
		const fake = data({ bans: [{ id: 1, username: 'valdefsx', ip: '', email: '', message: '', expire: null }] });
		app = await buildApp(fakeDeps(fake));
		const res = await post(app, 2, '/profile.php?section=essentials&id=6', {
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
	});

	it('Affichage et Vie privée : thèmes, cases conditionnelles', async () => {
		const fake = data();
		const server = await start(fake, { privateMessagesEnabled: true });
		const display = await get(server, 3, '/profile.php?section=display&id=3');
		expect(display.body).toContain('<option value="GreenDark">GreenDark</option>');
		expect(display.body).not.toContain('reputation_enable');
		const privacy = await get(server, 3, '/profile.php?section=privacy&id=3');
		expect(privacy.body).toContain('name="form[use_pm]" value="1" checked');
		expect(privacy.body).not.toContain('notify_pm_full');
	});

	it('Personnalité : aperçu de la signature et liens de l’avatar', async () => {
		const fake = data();
		const server = await start(fake, { avatars: true });
		const res = await get(server, 3, '/profile.php?section=personality&id=3');
		expect(res.body).toContain('<strong>Bons vols</strong>');
		expect(res.body).toContain('profile.php?action=upload_avatar&amp;id=3');
		expect(res.body).toContain('400 caractères et 4 lignes autorisés');
	});
});

describe('profile.php : avatar', () => {
	it('envoie un avatar contrôlé sur son contenu, et refuse un faux', async () => {
		const fake = data();
		const server = await start(fake, { avatars: true });
		const form = await get(server, 3, '/profile.php?action=upload_avatar&id=3');
		expect(form.body).toContain('enctype="multipart/form-data"');
		// Recadrage par le navigateur aux dimensions permises (js/image-resize.js).
		expect(form.body).toMatch(/data-resize="cover" data-resize-width="\d+" data-resize-height="\d+"/);
		expect(form.body).toContain('js/image-resize.js');

		const ok = await postFile(server, 3, '/profile.php?action=upload_avatar2&id=3', 'req_file', 'moi.png', png(50, 50));
		expect(ok.statusCode).toBe(303);
		expect(fake.avatarLog).toEqual(['save 3.png']);

		const bad = await postFile(server, 3, '/profile.php?action=upload_avatar2&id=3', 'req_file', 'moi.png', Buffer.from('<?php'));
		expect(bad.body).toContain('Ce type de fichier n&#39;est pas autorisé');
		expect(fake.avatarLog).toHaveLength(1);

		// Trop grande : refusée, comme dans FluxBB (pas de bibliothèque d'images dans le Worker).
		const big = await postFile(server, 3, '/profile.php?action=upload_avatar2&id=3', 'req_file', 'grand.png', png(800, 600));
		expect(big.statusCode).toBe(200);
		expect(big.body).toContain('plus large et/ou plus haute que le maximum autorisé');
		expect(fake.avatarLog).toEqual(['save 3.png']);
	});

	it("efface l'avatar après confirmation (POST)", async () => {
		const fake = data();
		const server = await start(fake, { avatars: true });
		const confirm = await get(server, 3, '/profile.php?action=delete_avatar&id=3');
		expect(confirm.body).toContain('action="/profile.php?action=delete_avatar&amp;id=3"');
		expect(fake.avatarLog).toBeUndefined();
		expect((await post(server, 3, '/profile.php?action=delete_avatar&id=3', {})).statusCode).toBe(303);
		expect(fake.avatarLog).toEqual(['delete 3']);
	});

	it('avatars désactivés : action refusée', async () => {
		const fake = data();
		const server = await start(fake, { avatars: false });
		expect((await get(server, 3, '/profile.php?action=upload_avatar&id=3')).statusCode).toBe(404);
	});
});

describe('profile.php : compte SSO', () => {
	const essentials = (username: string) => ({
		form_sent: '1',
		req_username: username,
		req_email: 'tessy@example.test',
		'form[timezone]': '1',
	});

	it('le membre change son pseudo une seule fois', async () => {
		const fake = data();
		const server = await start(fake);
		const form = await get(server, 3, '/profile.php?section=essentials&id=3');
		expect(form.body).toContain('name="req_username"');
		expect(form.body).toContain('Vous pouvez le changer une seule fois');

		const renamed = await post(server, 3, '/profile.php?section=essentials&id=3', essentials('Tessy Pilote'));
		expect(renamed.statusCode).toBe(303);
		expect(fake.renames).toEqual([{ id: 3, from: 'Tessy', to: 'Tessy Pilote' }]);
		expect(fake.profileUpdates?.at(-1)?.changes.usernameChanged).toBe(true);

		// Ensuite, le champ disparaît et un nouvel envoi n'a aucun effet sur le pseudo.
		expect((await get(server, 3, '/profile.php?section=essentials&id=3')).body).not.toContain('name="req_username"');
		await post(server, 3, '/profile.php?section=essentials&id=3', essentials('Encore autre'));
		expect(fake.renames).toHaveLength(1);
	});

	it('un modérateur sans droit de renommer ne renomme pas un membre', async () => {
		const fake = data();
		const server = await start(fake);
		expect((await get(server, 5, '/profile.php?section=essentials&id=3')).body).not.toContain('name="req_username"');
	});

	it('« Mon compte » sur son profil seulement ; pas de suppression pour un administrateur', async () => {
		const fake = data();
		const server = await start(fake);
		const own = await get(server, 3, '/profile.php?section=essentials&id=3');
		expect(own.body).toContain('action="/connexion?action=out_all"');
		expect(own.body).toContain('href="/profile.php?action=delete_account&amp;id=3"');
		expect((await get(server, 5, '/profile.php?section=essentials&id=3')).body).not.toContain('out_all');
		const adminOwn = await get(server, 2, '/profile.php?section=essentials&id=2');
		expect(adminOwn.body).toContain('out_all');
		expect(adminOwn.body).not.toContain('delete_account');
	});

	it('supprime son compte après confirmation : session fermée, avatar effacé', async () => {
		const fake = data();
		const server = await start(fake);
		const confirm = await get(server, 3, '/profile.php?action=delete_account&id=3');
		expect(confirm.body).toContain('Supprimer définitivement votre compte');
		expect(fake.accountLog).toBeUndefined();

		const res = await post(server, 3, '/profile.php?action=delete_account&id=3', {});
		expect(res.statusCode).toBe(303);
		expect(fake.accountLog).toEqual(['delete 3 Tessy → Membre supprimé']);
		expect(fake.avatarLog).toEqual(['delete 3']);
		expect([res.headers['set-cookie']].flat().some((c) => String(c).startsWith('avrobb_session=;'))).toBe(true);
	});

	it('ni le compte d’un autre, ni celui d’un administrateur', async () => {
		const fake = data();
		const server = await start(fake);
		expect((await post(server, 5, '/profile.php?action=delete_account&id=3', {})).statusCode).toBe(403);
		expect((await get(server, 2, '/profile.php?action=delete_account&id=2')).statusCode).toBe(403);
		expect((await post(server, 2, '/profile.php?action=delete_account&id=2', {})).statusCode).toBe(403);
		expect(fake.accountLog).toBeUndefined();
	});
});
