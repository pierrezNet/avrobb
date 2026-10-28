/**
 * Options du forum (admin_options.php) de bout en bout avec les doublures : accès administrateur,
 * affichage des valeurs, enregistrement des seules clés modifiées, erreurs réaffichées.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { GroupId } from '../src/domain/models.ts';
import { csrfToken } from '../src/http/csrf.ts';
import { buildLegacyCookie } from '../src/services/legacySession.ts';
import { type FakeData, fakeDeps, group, guest, NOW, viewer } from './fixtures.ts';
import { optionsForm } from './optionsForm.ts';

const SEED = 'graine-de-test';
const CSRF_SECRET = '9'.repeat(64);
const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true }) });
const admin = viewer({ id: 2, username: 'admin', group: group({ id: GroupId.Admin }) });
const hashes: Record<number, string> = { 5: 'h5', 2: 'h2' };
const cookies = (userId: number): string =>
	`punbb_cookie=${buildLegacyCookie(userId, hashes[userId] ?? '', NOW + 3600, SEED)}; punbb_cookie_csrf=${CSRF_SECRET}`;

const current = (): Map<string, string> =>
	new Map([
		...Object.entries(optionsForm()).map(([key, value]) => [`o_${key}`, value] as [string, string]),
		['o_quickpost', '1'],
		['o_smtp_pass', 'old'],
		['p_message_bbcode', '1'],
		['p_sig_length', '400'],
	]);

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

async function start(): Promise<{ server: FastifyInstance; fake: FakeData }> {
	const fake: FakeData = {
		users: [
			{ viewer: guest, passwordHash: '' },
			{ viewer: mod, passwordHash: 'h5' },
			{ viewer: admin, passwordHash: 'h2' },
		],
		topics: [],
		posts: new Map(),
		configValues: current(),
	};
	app = await buildApp(fakeDeps(fake));
	return { server: app, fake };
}

function save(server: FastifyInstance, userId: number, fields: Record<string, string>, url = '/admin_options.php') {
	const body = new URLSearchParams({ csrf_token: csrfToken(CSRF_SECRET, SEED, userId), form_sent: '1' });
	for (const [name, value] of Object.entries(fields)) body.append(`form[${name}]`, value);
	return server.inject({
		method: 'POST',
		url,
		headers: { cookie: cookies(userId), 'content-type': 'application/x-www-form-urlencoded' },
		payload: body.toString(),
	});
}

describe('admin_options.php', () => {
	it('réservé aux administrateurs', async () => {
		const { server } = await start();
		expect((await server.inject({ url: '/admin_options.php', headers: { cookie: cookies(5) } })).statusCode).toBe(403);
		expect((await save(server, 5, optionsForm())).statusCode).toBe(403);
		const res = await server.inject({ url: '/admin_options.php', headers: { cookie: cookies(2) } });
		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('name="form[board_title]" value="Pilote-Virtuel"');
		// Options de FluxBB sans effet dans AvroBB : absentes du formulaire.
		for (const removed of ['gzip', 'time_format', 'date_format', 'default_lang', 'show_version'])
			expect(res.body).not.toContain(`name="form[${removed}]"`);
		expect(res.body).toContain('name="form[quickpost]" value="1" checked');
		expect(res.body).not.toContain('old');
	});

	it("n'écrit que les clés modifiées et invalide le cache", async () => {
		const { server, fake } = await start();
		const res = await save(server, 2, optionsForm({ board_title: 'PV', quickpost: '1', announcement: '1' }));
		expect(res.headers.location).toBe('admin_options.php?done=updated');
		expect(fake.configUpdates).toEqual([new Map([['o_board_title', 'PV']])]);
		expect(fake.configInvalidations).toBe(1);
		const page = await server.inject({ url: '/admin_options.php?done=updated', headers: { cookie: cookies(2) } });
		expect(page.body).toContain('Options mises à jour.');
	});

	it('réaffiche la saisie avec les erreurs, sans rien écrire', async () => {
		const { server, fake } = await start();
		const res = await save(server, 2, optionsForm({ board_title: '', board_desc: 'Nouvelle <b>desc</b>' }));
		expect(res.statusCode).toBe(400);
		expect(res.body).toContain('Vous devez spécifier un nom pour le forum.');
		expect(res.body).toContain('value="Nouvelle &lt;b&gt;desc&lt;/b&gt;"');
		expect(fake.configUpdates).toBeUndefined();
		expect((await save(server, 2, optionsForm({ feed_type: '9' }))).statusCode).toBe(400);
	});
});

describe('admin_permissions.php', () => {
	it('affiche et enregistre les clés p_* modifiées, jamais négatives', async () => {
		const { server, fake } = await start();
		expect((await server.inject({ url: '/admin_permissions.php', headers: { cookie: cookies(5) } })).statusCode).toBe(403);
		const page = await server.inject({ url: '/admin_permissions.php', headers: { cookie: cookies(2) } });
		expect(page.body).toContain('name="form[message_bbcode]" value="1" checked');
		expect(page.body).toContain('name="form[sig_length]" value="400"');
		expect(page.body).toContain('action="admin_permissions.php"');
		const res = await save(server, 2, { message_bbcode: '1', sig_length: '-5' }, '/admin_permissions.php');
		expect(res.headers.location).toBe('admin_permissions.php?done=updated');
		expect(fake.configUpdates).toEqual([new Map([['p_sig_length', '0']])]);
		expect(fake.configInvalidations).toBe(1);
	});
});
