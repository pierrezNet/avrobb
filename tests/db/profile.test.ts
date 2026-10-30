/**
 * Modification des profils sur une vraie base (repositories/ProfileRepository.ts) : champs vides
 * enregistrés NULL, renommage et ses effets de bord, activations, abonnements suivis.
 * Chaque test s'exécute dans une transaction annulée à la fin.
 */

import type { Kysely } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/db/database.ts';
import type { Database } from '../../src/db/schema.ts';
import { ProfileRepository } from '../../src/repositories/ProfileRepository.ts';
import { testDbConfig } from './testDatabase.ts';

const db = createDatabase(testDbConfig());
afterAll(async () => db.destroy());

class Rollback extends Error {}

async function inRollback(body: (trx: Kysely<Database>) => Promise<void>): Promise<void> {
	await db
		.transaction()
		.execute(async (trx) => {
			await body(trx);
			throw new Rollback();
		})
		.catch((error: unknown) => {
			if (!(error instanceof Rollback)) throw error;
		});
}

describe('ProfileRepository', () => {
	it('lit le profil complet et enregistre les champs vides en NULL', async () => {
		await inRollback(async (trx) => {
			const profiles = new ProfileRepository(trx);
			const before = await profiles.findEditableProfile(3);
			expect(before).toMatchObject({ username: 'Tessy', title: 'Pilote de ligne', style: 'GreenDark', postsPerPage: 1, groupId: 4 });
			expect(await profiles.findEditableProfile(1)).toBeNull();

			await profiles.updateProfile(3, { title: '', location: 'Lyon', postsPerPage: null, dst: true, usesPrivateMessages: false });
			const row = await trx
				.selectFrom('users')
				.select(['title', 'location', 'disp_posts', 'dst', 'use_pm'])
				.where('id', '=', 3)
				.executeTakeFirstOrThrow();
			expect(row).toEqual({ title: null, location: 'Lyon', disp_posts: null, dst: 1, use_pm: 0 });
		});
	});

	it('renomme un modérateur partout où figure son pseudo', async () => {
		await inRollback(async (trx) => {
			await trx
				.insertInto('bans')
				.values({ username: 'MaxDUO', ip: null, email: null, message: null, expire: null, ban_creator: 2 })
				.execute();
			await trx
				.insertInto('messages')
				.values({
					shared_id: 9,
					owner: 3,
					subject: 'MP',
					message: 'x',
					sender: 'MaxDUO',
					receiver: 'Max, MaxDUO',
					sender_id: 5,
					receiver_id: '7, 5',
					sender_ip: '',
					hide_smilies: 0,
					posted: 1,
					showed: 0,
					show_message: 1,
				})
				.execute();
			await trx.insertInto('contacts').values({ user_id: 3, contact_id: 5, contact_name: 'MaxDUO', allow_msg: 1 }).execute();

			const result = await new ProfileRepository(trx).renameUser(5, 'MaxDUO', 'Maxime', { location: 'Toulon' });
			expect(result).toEqual({ bansUpdated: true });

			const post = await trx.selectFrom('posts').select(['poster', 'edited_by']).where('id', '=', 101).executeTakeFirstOrThrow();
			expect(post).toEqual({ poster: 'Maxime', edited_by: 'Maxime' });
			const forum = await trx.selectFrom('forums').select('moderators').where('id', '=', 2).executeTakeFirstOrThrow();
			expect(forum.moderators).toBe('a:1:{s:6:"Maxime";i:5;}');
			const online = await trx.selectFrom('online').select('ident').where('user_id', '=', 5).executeTakeFirstOrThrow();
			expect(online.ident).toBe('Maxime');
			const message = await trx.selectFrom('messages').select(['sender', 'receiver']).where('shared_id', '=', 9).executeTakeFirstOrThrow();
			expect(message).toEqual({ sender: 'Maxime', receiver: 'Max, Maxime' });
			const contact = await trx.selectFrom('contacts').select('contact_name').where('contact_id', '=', 5).executeTakeFirstOrThrow();
			expect(contact.contact_name).toBe('Maxime');
			const user = await trx.selectFrom('users').select(['username', 'location']).where('id', '=', 5).executeTakeFirstOrThrow();
			expect(user).toEqual({ username: 'Maxime', location: 'Toulon' });
		});
	});

	it('pseudo ressemblant et adresses déjà prises, hors le membre lui-même', async () => {
		const profiles = new ProfileRepository(db);
		expect(await profiles.findSimilarUsername('TESSY', 'TESSY', 3)).toBeNull();
		expect(await profiles.findSimilarUsername('tessy', 'tessy', 5)).toBe('Tessy');
		expect(await profiles.listUsernamesByEmail('tessy@example.test', 3)).toEqual([]);
		expect(await profiles.listUsernamesByEmail('tessy@example.test', 5)).toEqual(['Tessy']);
	});
});
