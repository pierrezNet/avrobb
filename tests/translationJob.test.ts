/**
 * Traduction d'un texte (controllers/translationJob.ts) avec un faux modèle : enregistrement dans la
 * bonne langue, BBCode restauré, réponse inutilisable notée « rien à traduire », modèle indisponible
 * laissé pour plus tard. Puis affichage des traductions (sujet, forum, accueil) dans chaque langue.
 */

import { describe, expect, it } from 'vitest';
import type { TextModel } from '../src/adapters/textModel.ts';
import { buildApp } from '../src/app.ts';
import { translateSource, translateSources } from '../src/controllers/translationJob.ts';
import { en, enDateWords } from '../src/lang/en/index.ts';
import type { TranslationSource } from '../src/repositories/TranslationRepository.ts';
import { type FakeData, type FakeTranslation, fakeDeps, guest, NOW, post, sessionCookie, topic, viewer } from './fixtures.ts';
import { inject } from './inject.ts';

const silent = { error: () => undefined, info: () => undefined };

function job(replies: (string | null)[]) {
	const saved: string[] = [];
	const prompts: string[] = [];
	const model: TextModel = {
		complete: async (_instructions, text) => {
			prompts.push(text);
			return replies.shift() ?? null;
		},
	};
	const deps = {
		model,
		translations: {
			save: async (source: TranslationSource, lang: string, text: string) => void saved.push(`${source.kind}:${source.id}:${lang}:${text}`),
		},
		keepNames: async () => ['AvroBB', 'Donne Ton Point'],
		clock: () => NOW,
		logger: silent,
	};
	return { deps, saved, prompts };
}

describe('translateSource()', () => {
	it('français → anglais : marqueurs envoyés au modèle, BBCode remis à sa place', async () => {
		const { deps, saved, prompts } = job(['{"source": "fr", "translation": "Hello ⟦0⟧everyone⟦1⟧"}']);
		expect(await translateSource(deps, { kind: 'post', id: 7, text: 'Bonjour [b]à tous[/b]' })).toBe(true);
		expect(prompts).toEqual(['Bonjour ⟦0⟧à tous⟦1⟧']);
		expect(saved).toEqual(['post:7:en:Hello [b]everyone[/b]']);
	});

	it('anglais → français ; autre langue → français', async () => {
		const { deps, saved } = job(['{"source": "en", "translation": "Bonjour"}', '{"source": "other", "translation": "Bonjour"}']);
		await translateSources(deps, [
			{ kind: 'subject', id: 1, text: 'Hello' },
			{ kind: 'subject', id: 2, text: 'Hallo' },
		]);
		expect(saved).toEqual(['subject:1:fr:Bonjour', 'subject:2:fr:Bonjour']);
	});

	it('réponse inutilisable : « rien à traduire » ; nom propre ou rien de traduisible : pas d’appel', async () => {
		const { deps, saved, prompts } = job(['{"source": "fr", "translation": "Hello everyone"}', 'pas du JSON']);
		// Marqueur perdu : le lien aurait disparu.
		await translateSource(deps, { kind: 'post', id: 1, text: 'Bonjour [b]à tous[/b]' });
		await translateSource(deps, { kind: 'post', id: 2, text: 'Bonjour' });
		await translateSource(deps, { kind: 'forum_name', id: 3, text: 'Donne Ton Point' });
		await translateSource(deps, { kind: 'post', id: 4, text: '[img]https://ex.test/a.png[/img]' });
		expect(saved).toEqual(['post:1:-:', 'post:2:-:', 'forum_name:3:-:', 'post:4:-:']);
		expect(prompts).toHaveLength(2);
	});

	it('modèle indisponible : rien d’enregistré, arrêt de la série (repris plus tard)', async () => {
		const { deps, saved } = job([null]);
		const done = await translateSources(deps, [
			{ kind: 'post', id: 1, text: 'Bonjour' },
			{ kind: 'post', id: 2, text: 'Salut' },
		]);
		expect(done).toBe(0);
		expect(saved).toEqual([]);
	});
});

describe('affichage des traductions', () => {
	const translations: FakeTranslation[] = [
		{ kind: 'post', id: 40, lang: 'en', text: 'Hello [b]everyone[/b]', source: 'Bonjour [b]à tous[/b]' },
		{ kind: 'post', id: 41, lang: 'en', text: 'Stale translation', source: 'Ancien texte' },
		{ kind: 'subject', id: 4, lang: 'en', text: 'First topic', source: 'Premier sujet' },
	];
	const data = (): FakeData => ({
		users: [{ viewer: guest }],
		topics: [topic({ id: 4, subject: 'Premier sujet' })],
		posts: new Map([
			[
				4,
				[
					{ ...post(40), message: 'Bonjour [b]à tous[/b]' },
					{ ...post(41), message: 'Texte modifié' },
				],
			],
		]),
		translations,
	});
	const englishApp = () => buildApp({ ...fakeDeps(data()), page: { locale: 'en', lang: en, dateWords: enDateWords, clock: () => NOW } });

	it('page anglaise : message et titre traduits, mention et original dépliable ; traduction périmée ignorée', async () => {
		const page = await inject(await englishApp(), '/sujet/4-premier-sujet');
		expect(page.statusCode).toBe(200);
		expect(page.body).toContain('Hello <strong>everyone</strong>');
		expect(page.body).toContain('<span class="post__translated">Machine translated</span> · Show original');
		expect(page.body).toContain('Bonjour <strong>à tous</strong>');
		expect(page.body).toContain('First topic');
		// Message modifié depuis sa traduction : affiché tel quel, sans mention.
		expect(page.body).toContain('Texte modifié');
		expect(page.body).not.toContain('Stale translation');
		expect(page.body.match(/post__translated/g)).toHaveLength(1);
		// Adresse canonique tirée du titre d'origine : la même dans les deux langues.
		expect(page.body).toContain('<link rel="canonical" href="http://forum.test/en/topic/4-premier-sujet">');
	});

	it('page française : rien de traduit vers l’anglais n’apparaît', async () => {
		const page = await inject(await buildApp(fakeDeps(data())), '/sujet/4-premier-sujet');
		expect(page.body).toContain('Bonjour <strong>à tous</strong>');
		expect(page.body).not.toContain('Hello');
		expect(page.body).not.toContain('post__translated');
	});
});

describe('traduction à la publication', () => {
	it('réponse publiée : traduite après la réponse HTTP (waitUntil)', async () => {
		const { deps, saved } = job(['{"source": "fr", "translation": "Thanks"}']);
		const app = await buildApp({
			...fakeDeps({ users: [{ viewer: guest }, { viewer: viewer() }], topics: [topic({ id: 10 })], posts: new Map([[10, [post(100)]]]) }),
			translationJob: deps,
		});
		const cookie = sessionCookie(3);
		const form = await inject(app, { url: '/post.php?tid=10', headers: { cookie } });
		const csrf =
			[form.headers['set-cookie']]
				.flat()
				.find((c) => c?.startsWith('avrobb_csrf='))
				?.split(';')[0] ?? '';
		const token = /name="csrf_token" value="([0-9a-f]+)"/.exec(form.body)?.[1] ?? '';
		const res = await inject(app, {
			method: 'POST',
			url: '/post.php?action=post&tid=10',
			headers: { cookie: `${cookie}; ${csrf}`, 'content-type': 'application/x-www-form-urlencoded' },
			payload: new URLSearchParams({ csrf_token: token, form_sent: '1', req_message: 'Merci' }).toString(),
		});
		expect(res.statusCode).toBe(302);
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(saved).toHaveLength(1);
		expect(saved[0]).toMatch(/^post:\d+:en:Thanks$/);
	});
});
