/**
 * Aide BBCode : exemples rendus par le vrai parseur, émoticônes regroupées.
 */

import { describe, expect, it } from 'vitest';
import { buildApp, type ForumApp } from '../src/app.ts';
import { fakeDeps, guest } from './fixtures.ts';
import { inject } from './inject.ts';

let app: ForumApp | undefined;

describe('GET /help.php', () => {
	it('montre chaque balise et son rendu réel, et les émoticônes en émojis', async () => {
		app = await buildApp(fakeDeps({ users: [{ viewer: guest }], topics: [], posts: new Map() }));
		const res = await inject(app, '/help.php');

		expect(res.statusCode).toBe(200);
		expect(res.body).toContain('<title>Aide / Forum de test</title>');
		expect(res.body).toContain('<code>[b]Texte en gras[/b]</code>');
		expect(res.body).toContain('<dd class="bbcode"><p><strong>Texte en gras</strong></p></dd>');
		expect(res.body).toContain('<a href="http://forum.test/aide" rel="nofollow">Cette page d&#039;aide</a>');
		expect(res.body).toContain('<ol class="alpha">');
		expect(res.body).toContain('<details class="spoiler">');
		expect(res.body).toContain('<code>:)</code> et <code>=)</code>');
		expect(res.body).toContain('aria-label="smile">🙂</span>');
		expect(res.body).toContain('id="smilies"');
	});
});
