/**
 * AccountRepository sur D1 : compte SSO créé puis retrouvé, pseudo déjà pris, numéro de session,
 * suppression du compte avec anonymisation des messages publics.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { AccountRepository, type NewAccount } from '../../src/repositories/AccountRepository.ts';
import { UserRepository } from '../../src/repositories/UserRepository.ts';
import { closeTestDatabase, inRollback } from './testDb.ts';

afterAll(closeTestDatabase);

const account = (overrides: Partial<NewAccount> = {}): NewAccount => ({
	provider: 'github',
	providerId: '4242',
	username: 'epierrez',
	email: 'e@example.test',
	groupId: 4,
	registeredAt: 1_782_950_000,
	ip: '192.0.2.40',
	timezone: 1,
	dst: false,
	style: 'GlowingRed',
	emailSetting: 1,
	...overrides,
});

describe('AccountRepository', () => {
	it('crée un compte SSO, le retrouve par (fournisseur, identifiant), refuse un pseudo pris', async () => {
		await inRollback(async (trx) => {
			const accounts = new AccountRepository(trx);
			expect(await accounts.findByProvider('github', '4242')).toBeNull();
			const id = await accounts.createAccount(account());
			expect(id).toBeGreaterThan(5);
			expect(await accounts.findByProvider('github', '4242')).toEqual({ id, sessionVersion: 0 });
			expect(await accounts.findByProvider('google', '4242')).toBeNull();

			const viewer = await new UserRepository(trx).findViewer(id ?? 0);
			expect(viewer?.viewer).toMatchObject({ username: 'epierrez', email: 'e@example.test', style: 'GlowingRed', timezone: 1 });
			// Pseudo identique à la casse près (COLLATE NOCASE) : null, l'appelant essaie une variante.
			expect(await accounts.createAccount(account({ providerId: '9', username: 'EPIERREZ' }))).toBeNull();
			// Même identité chez le fournisseur : contrainte unique, erreur.
			await expect(accounts.createAccount(account({ username: 'autre' }))).rejects.toThrow();
		});
	});

	it('« me déconnecter de partout » incrémente le numéro de session', async () => {
		await inRollback(async (trx) => {
			const accounts = new AccountRepository(trx);
			await accounts.endAllSessions(3);
			await accounts.endAllSessions(3);
			expect((await new UserRepository(trx).findViewer(3))?.sessionVersion).toBe(2);
		});
	});

	it('suppression : messages publics anonymisés, données personnelles effacées', async () => {
		await inRollback(async (trx) => {
			await new AccountRepository(trx).deleteAccount(3, 'Tessy', 'Membre supprimé');
			expect(await new UserRepository(trx).findViewer(3)).toBeNull();
			const post = await trx
				.selectFrom('posts')
				.select(['poster', 'poster_id', 'poster_ip'])
				.where('id', '=', 100)
				.executeTakeFirstOrThrow();
			expect(post).toEqual({ poster: 'Membre supprimé', poster_id: 1, poster_ip: null });
			const topic = await trx.selectFrom('topics').select('poster').where('id', '=', 10).executeTakeFirstOrThrow();
			expect(topic.poster).toBe('Membre supprimé');
			const left = async (table: 'topic_subscriptions' | 'forum_subscriptions' | 'online', column: 'user_id') =>
				(await trx.selectFrom(table).select(column).where(column, '=', 3).execute()).length;
			expect(await left('topic_subscriptions', 'user_id')).toBe(0);
			expect(await left('forum_subscriptions', 'user_id')).toBe(0);
			expect(await left('online', 'user_id')).toBe(0);
			expect((await trx.selectFrom('messages').select('id').where('owner', '=', 3).execute()).length).toBe(0);
			expect((await trx.selectFrom('gallery').select('id').where('user_id', '=', 3).execute()).length).toBe(0);
			// Les messages des autres membres ne bougent pas.
			const other = await trx.selectFrom('posts').select('poster').where('id', '=', 101).executeTakeFirstOrThrow();
			expect(other.poster).toBe('MaxDUO');
		});
	});
});
