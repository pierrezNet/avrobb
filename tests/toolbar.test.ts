/**
 * Barre d'outils BBCode : choix des boutons selon les réglages du forum, et présence sur les pages
 * de rédaction.
 */

import { describe, expect, it } from 'vitest';
import { buildApp, type ForumApp } from '../src/app.ts';
import { fr } from '../src/lang/fr/index.ts';
import { TOOLBAR, type ToolbarSettings, toolbarButtons } from '../src/services/toolbar.ts';
import { fakeDeps, guest, post, sessionCookie, topic, viewer } from './fixtures.ts';
import { inject } from './inject.ts';

const all = { bbcode: true, imgTag: true, smilies: true };
const names = (settings: ToolbarSettings, options = all, form: 'form' | 'quickform' = 'form'): string[] =>
	toolbarButtons(settings, form, options, fr.toolbar)?.buttons.map((b) => b.name) ?? [];

describe('toolbarButtons (generate_ftb_cache())', () => {
	it('boutons par défaut, émoticônes en dernier, actions des balises', () => {
		const toolbar = toolbarButtons(TOOLBAR, 'form', all, fr.toolbar);
		expect(toolbar?.imageDir).toBe('/assets/img/toolbar/');
		expect(toolbar?.buttons.at(-1)).toMatchObject({ name: 'smilies', action: { kind: 'smilies' } });
		const byName = new Map(toolbar?.buttons.map((b) => [b.name, b]));
		expect(byName.get('bold')).toMatchObject({
			image: 'bold.svg',
			action: { kind: 'wrap', tag: 'b' },
			label: 'Texte en gras : [b]texte[/b]',
		});
		expect(byName.get('link')?.action).toMatchObject({ kind: 'pair', tag: 'url', reverse: false });
		expect(byName.get('img')?.action).toMatchObject({ kind: 'pair', tag: 'img', reverse: true });
		expect(byName.get('quote')?.action).toMatchObject({ kind: 'argument', tag: 'quote' });
		expect(byName.get('video')?.action).toMatchObject({ kind: 'inside', tag: 'video' });
		expect(byName.get('color')?.action).toEqual({ kind: 'color' });
	});

	it('fenêtres : tous les champs d’un bouton, libellés, préremplissage par la sélection', () => {
		const byName = new Map(toolbarButtons(TOOLBAR, 'form', all, fr.toolbar)?.buttons.map((b) => [b.name, b.action]));
		const link = byName.get('link');
		if (link?.kind !== 'pair') throw new Error('lien attendu');
		expect(link.dialog).toMatchObject({ title: 'Insérer un lien', submit: 'Insérer', cancel: 'Annuler' });
		expect(link.dialog.fields).toMatchObject([
			{ kind: 'url', label: 'Adresse du lien', required: true, fill: 'url' },
			{ kind: 'text', label: 'Texte affiché', required: false, fill: 'text' },
		]);
		const list = byName.get('list');
		if (list?.kind !== 'argument') throw new Error('liste attendue');
		expect(list.dialog.fields[0]).toMatchObject({
			kind: 'choice',
			choices: [
				{ value: '*', label: 'À puces (•)' },
				{ value: '1', label: 'Numérotée (1, 2, 3)' },
				{ value: 'a', label: 'Alphabétique (a, b, c)' },
			],
		});
		const quote = byName.get('quote');
		expect(quote?.kind === 'argument' && quote.dialog.fields[0]?.kind).toBe('member');
		const img = byName.get('img');
		expect(img?.kind === 'pair' && img.dialog.fields[0]).toMatchObject({ preview: true });
	});

	it('vidéo : adresses reconnues par le BBCode, message sinon', () => {
		const video = toolbarButtons(TOOLBAR, 'form', all, fr.toolbar)?.buttons.find((b) => b.name === 'video')?.action;
		if (video?.kind !== 'inside') throw new Error('vidéo attendue');
		const field = video.dialog.fields[0];
		if (field === undefined || field.kind === 'choice') throw new Error('champ attendu');
		const known = (url: string) => field.patterns.some((source) => new RegExp(source).test(url));
		expect(known('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
		expect(known('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
		expect(known('https://www.dailymotion.com/video/x8abc12')).toBe(true);
		expect(known('https://vimeo.com/123456')).toBe(true);
		expect(known('https://example.test/film.mp4')).toBe(false);
		expect(field.invalid).toContain('YouTube, Dailymotion et Vimeo');
	});

	it('suit o_smilies, p_message_img_tag et p_message_bbcode', () => {
		expect(names(TOOLBAR, { ...all, smilies: false })).not.toContain('smilies');
		expect(names(TOOLBAR, { ...all, imgTag: false })).not.toContain('img');
		expect(names(TOOLBAR, { bbcode: false, imgTag: true, smilies: true })).toEqual(['img', 'smilies']);
	});

	it('barre désactivée ou bouton retiré pour un formulaire', () => {
		const custom: ToolbarSettings = {
			...TOOLBAR,
			enableQuick: false,
			tags: TOOLBAR.tags.map((t) => (t.name === 'strike' ? { ...t, enableForm: false } : t)),
		};
		expect(toolbarButtons(custom, 'quickform', all, fr.toolbar)).toBeNull();
		expect(names(custom)).not.toContain('strike');
	});
});

let app: ForumApp | undefined;

describe('pages de rédaction', () => {
	const cookie = `${sessionCookie(3)}`;
	const data = () => ({
		users: [{ viewer: guest }, { viewer: viewer() }],
		topics: [topic({ id: 10 })],
		posts: new Map([[10, [post(100)]]]),
	});

	it('place la barre (masquée sans JavaScript) au-dessus du message', async () => {
		app = await buildApp(fakeDeps(data()));
		for (const url of ['/ecrire?tid=10', '/viewtopic.php?id=10']) {
			const res = await inject(app, { url, headers: { cookie } });
			expect(res.body).toMatch(/<div class="bbcode-toolbar" data-toolbar="\{&quot;label&quot;:/);
			expect(res.body).toContain('data-toolbar-images="/assets/img/toolbar/"');
			expect(res.body).toContain('/assets/js/toolbar.js?v=');
			// Bouton image d'un membre : URL, galerie ou nouvelle image.
			expect(res.body).toContain('&quot;galleryUrl&quot;:&quot;/galerie?info=pick&amp;embed=1&quot;');
		}
	});

	it('chaque bouton a son icône dans public/assets/', async () => {
		const { existsSync } = await import('node:fs');
		for (const button of TOOLBAR.tags) expect(existsSync(`public/assets/img/toolbar/${button.image}`), button.image).toBe(true);
	});
});
