/**
 * Barre d'outils BBCode (FluxToolBar) : choix des boutons selon les réglages, et présence sur les
 * pages de rédaction.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { fr } from '../src/lang/fr/index.ts';
import { buildLegacyCookie } from '../src/services/legacySession.ts';
import { DEFAULT_TOOLBAR, type ToolbarSettings, toolbarButtons } from '../src/services/toolbar.ts';
import { fakeDeps, guest, NOW, post, topic, viewer } from './fixtures.ts';

const all = { bbcode: true, imgTag: true, smilies: true };
const names = (settings: ToolbarSettings, options = all, form: 'form' | 'quickform' = 'form'): string[] =>
	toolbarButtons(settings, form, options, fr.toolbar)?.buttons.map((b) => b.name) ?? [];

describe('toolbarButtons (generate_ftb_cache())', () => {
	it('boutons par défaut, émoticônes en dernier, actions des balises', () => {
		const toolbar = toolbarButtons(DEFAULT_TOOLBAR, 'form', all, fr.toolbar);
		expect(toolbar?.imageDir).toBe('img/fluxtoolbar/smooth/');
		expect(toolbar?.buttons.at(-1)).toMatchObject({ name: 'smilies', action: { kind: 'smilies' } });
		const byName = new Map(toolbar?.buttons.map((b) => [b.name, b]));
		expect(byName.get('bold')).toMatchObject({
			image: 'bt_bold.png',
			action: { kind: 'wrap', tag: 'b' },
			label: 'Texte en gras : [b]texte[/b]',
		});
		expect(byName.get('link')?.action).toMatchObject({ kind: 'pair', tag: 'url', reverse: false });
		expect(byName.get('img')?.action).toMatchObject({ kind: 'pair', tag: 'img', reverse: true });
		expect(byName.get('quote')?.action).toMatchObject({ kind: 'argument', tag: 'quote' });
		expect(byName.get('video')?.action).toMatchObject({ kind: 'inside', tag: 'video' });
		expect(byName.get('color')?.action).toEqual({ kind: 'color' });
	});

	it('suit o_smilies, p_message_img_tag et p_message_bbcode', () => {
		expect(names(DEFAULT_TOOLBAR, { ...all, smilies: false })).not.toContain('smilies');
		expect(names(DEFAULT_TOOLBAR, { ...all, imgTag: false })).not.toContain('img');
		expect(names(DEFAULT_TOOLBAR, { bbcode: false, imgTag: true, smilies: true })).toEqual(['img', 'smilies']);
	});

	it('réglages de l’administrateur : barre désactivée ou boutons choisis par formulaire', () => {
		const custom: ToolbarSettings = {
			...DEFAULT_TOOLBAR,
			enableQuick: false,
			tags: DEFAULT_TOOLBAR.tags.map((t) => (t.name === 'strike' ? { ...t, enableForm: false } : t)),
		};
		expect(toolbarButtons(custom, 'quickform', all, fr.toolbar)).toBeNull();
		expect(names(custom)).not.toContain('strike');
	});
});

let app: FastifyInstance | undefined;
afterEach(async () => app?.close());

describe('pages de rédaction', () => {
	const cookie = `punbb_cookie=${buildLegacyCookie(3, 'h', NOW + 3600, 'graine-de-test')}`;
	const data = () => ({
		users: [
			{ viewer: guest, passwordHash: '' },
			{ viewer: viewer(), passwordHash: 'h' },
		],
		topics: [topic({ id: 10 })],
		posts: new Map([[10, [post(100)]]]),
	});

	it('place la barre (masquée sans JavaScript) au-dessus du message', async () => {
		app = await buildApp(fakeDeps(data()));
		for (const url of ['/post.php?tid=10', '/viewtopic.php?id=10']) {
			const res = await app.inject({ url, headers: { cookie } });
			expect(res.body).toMatch(/<div class="bbcode-toolbar" data-toolbar="\{&quot;label&quot;:/);
			expect(res.body).toContain('data-toolbar-images="http://php.test/img/fluxtoolbar/smooth/"');
			expect(res.body).toContain('/assets/js/toolbar.js?v=');
			// Bouton image d'un membre : URL, galerie ou nouvelle image.
			expect(res.body).toContain('&quot;galleryUrl&quot;:&quot;gallery.php?info=pick&amp;embed=1&quot;');
		}
	});

	it('pas de barre quand l’administrateur l’a désactivée', async () => {
		app = await buildApp(fakeDeps(data(), { toolbar: { load: async () => ({ ...DEFAULT_TOOLBAR, enableForm: false }) } }));
		const res = await app.inject({ url: '/post.php?tid=10', headers: { cookie } });
		expect(res.body).not.toContain('data-toolbar=');
		expect(res.body).not.toContain('toolbar.js');
	});
});
