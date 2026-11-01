/**
 * Traductions automatiques (TranslationRepository) sur une vraie base : traduction valable tant que
 * le texte d'origine ne change pas, traduction manuelle préservée, éléments encore à traduire,
 * ménage des traductions périmées.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { TranslationRepository } from '../../src/repositories/TranslationRepository.ts';
import { closeTestDatabase, inRollback } from './testDb.ts';

afterAll(closeTestDatabase);

const NOW = 1_782_900_000;
const FIRST = { kind: 'post', id: 100, text: 'Premier message [b]gras[/b]' } as const;

describe('TranslationRepository', () => {
	it('une traduction n’est rendue que pour le texte qu’elle traduit', async () => {
		await inRollback(async (trx) => {
			const store = new TranslationRepository(trx);
			await store.save(FIRST, 'en', 'First post [b]bold[/b]', NOW);
			expect(await store.find('post', [FIRST, { id: 101, text: 'Deuxième message' }], 'en')).toEqual(
				new Map([[100, 'First post [b]bold[/b]']]),
			);
			expect(await store.find('post', [FIRST], 'fr')).toEqual(new Map());
			// Message modifié depuis : traduction périmée, plus rendue.
			expect(await store.find('post', [{ id: 100, text: 'Premier message revu' }], 'en')).toEqual(new Map());

			// Nouvelle traduction : remplace l'ancienne.
			await store.save(FIRST, 'en', 'First message [b]bold[/b]', NOW + 1);
			expect((await store.find('post', [FIRST], 'en')).get(100)).toBe('First message [b]bold[/b]');
		});
	});

	it('une traduction saisie à la main reste, même si le texte d’origine change', async () => {
		await inRollback(async (trx) => {
			await trx
				.insertInto('translations')
				.values({ kind: 'forum_name', item_id: 1, lang: 'en', text: 'Tech', source: 'Ancien nom', manual: 1, created: NOW })
				.execute();
			const store = new TranslationRepository(trx);
			await store.save({ kind: 'forum_name', id: 1, text: 'Technique' }, 'en', 'Technical', NOW);
			expect((await store.find('forum_name', [{ id: 1, text: 'Technique' }], 'en')).get(1)).toBe('Tech');
			expect((await store.listPending(100)).some((source) => source.kind === 'forum_name' && source.id === 1)).toBe(false);
		});
	});

	it('à traduire : forums, titres puis messages ; traduit, sans rien à traduire ou périmé', async () => {
		await inRollback(async (trx) => {
			const store = new TranslationRepository(trx);
			const keys = (await store.listPending(100)).map((source) => `${source.kind}:${source.id}`);
			expect(keys).toContain('forum_name:2');
			expect(keys).toContain('forum_desc:2');
			expect(keys).not.toContain('forum_desc:1');
			expect(keys).toContain('subject:10');
			// Lien de redirection d'un sujet déplacé : pas de titre propre à traduire.
			expect(keys).not.toContain('subject:12');
			expect(keys).toContain('post:100');
			expect(keys.indexOf('forum_name:2')).toBeLessThan(keys.indexOf('subject:10'));
			expect(keys.indexOf('subject:10')).toBeLessThan(keys.indexOf('post:100'));

			await store.save(FIRST, '-', '', NOW);
			expect((await store.listPending(100)).some((source) => source.kind === 'post' && source.id === 100)).toBe(false);
			// Le message change : sa traduction est périmée, il redevient à traduire.
			await trx.updateTable('posts').set({ message: 'Premier message revu' }).where('id', '=', 100).execute();
			const again = await store.listPending(100);
			expect(again.find((source) => source.kind === 'post' && source.id === 100)?.text).toBe('Premier message revu');
			expect(await store.listPending(2)).toHaveLength(2);
		});
	});

	it('ménage : traductions périmées ou d’éléments supprimés, sauf manuelles', async () => {
		await inRollback(async (trx) => {
			const store = new TranslationRepository(trx);
			await store.save(FIRST, 'en', 'First post', NOW);
			await store.save({ kind: 'post', id: 101, text: 'Ancien texte' }, 'en', 'Old text', NOW);
			await store.save({ kind: 'post', id: 999, text: 'Supprimé' }, 'en', 'Gone', NOW);
			await trx
				.insertInto('translations')
				.values({ kind: 'forum_name', item_id: 1, lang: 'en', text: 'Tech', source: 'Ancien nom', manual: 1, created: NOW })
				.execute();
			await store.purgeStale();
			const rows = await trx.selectFrom('translations').select(['kind', 'item_id']).orderBy('kind').execute();
			expect(rows).toEqual([
				{ kind: 'forum_name', item_id: 1 },
				{ kind: 'post', item_id: 100 },
			]);
		});
	});

	it('traduction manuelle : prioritaire, gardée, puis retirée pour revenir à l’automatique', async () => {
		await inRollback(async (trx) => {
			const store = new TranslationRepository(trx);
			const name = { kind: 'forum_name', id: 2, text: "Captures d'écran & Vidéos" } as const;
			await store.save(name, 'en', 'Screenshots & Videos', NOW);
			await store.setManual(name, 'en', 'Screenshots', NOW);
			expect(await store.findManual('forum_name', 2, 'en')).toBe('Screenshots');
			expect((await store.find('forum_name', [name], 'en')).get(2)).toBe('Screenshots');
			await store.save(name, 'en', 'Automatic', NOW);
			expect((await store.find('forum_name', [name], 'en')).get(2)).toBe('Screenshots');
			await store.setManual(name, 'en', null, NOW);
			expect(await store.findManual('forum_name', 2, 'en')).toBeNull();
			expect(await store.find('forum_name', [name], 'en')).toEqual(new Map());
		});
	});
});
