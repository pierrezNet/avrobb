/**
 * Activité de la semaine de l'accueil sur une vraie base (HomeActivityRepository) : discussions les
 * plus commentées lisibles par le groupe, dernier message avec image, nouveaux membres, sujets
 * actifs. Transactions annulées.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { GroupId } from '../../src/domain/models.ts';
import { HomeActivityRepository } from '../../src/repositories/HomeActivityRepository.ts';
import { closeTestDatabase, db, inRollback } from './testDb.ts';

afterAll(closeTestDatabase);

describe('HomeActivityRepository', () => {
	it('discussions les plus commentées : permissions, messages de la période, image la plus récente', async () => {
		await inRollback(async (trx) => {
			const activity = new HomeActivityRepository(trx);
			// Sujet 10 (forum 2) : 3 messages, dont 2 après 1782800050 ; le sujet 11 (forum 3) est interdit aux invités.
			expect(await activity.listHotTopics(GroupId.Guest, 1782800050, 5)).toEqual([expect.objectContaining({ id: 10, recentPosts: 2 })]);
			expect((await activity.listHotTopics(GroupId.Guest, 1782900000, 5)).length).toBe(0);

			await trx.updateTable('posts').set({ message: 'Voyez [img]http://a.test/1.png[/img]' }).where('id', '=', 100).execute();
			await trx.updateTable('posts').set({ message: 'Et [img=vue]http://a.test/2.png[/img]' }).where('id', '=', 101).execute();
			expect(await activity.findLatestImageMessages([10, 11])).toEqual(new Map([[10, 'Et [img=vue]http://a.test/2.png[/img]']]));
		});
	});

	it('nouveaux membres (ni invité ni comptes non validés) et sujets actifs', async () => {
		const activity = new HomeActivityRepository(db);
		expect((await activity.listNewMembers(1782150000, 10)).map((m) => m.username)).toEqual(['MaxDUO']);
		expect(await activity.listActiveSubjects(GroupId.Guest, 1782800100)).toContain('Postez un « vintage »');
		expect(await activity.listActiveSubjects(GroupId.Guest, 1782800100)).not.toContain('Réservé à l’équipe');
	});
});

describe('SitemapRepository', () => {
	it('forums et discussions lisibles par un invité, sans redirections', async () => {
		const { SitemapRepository } = await import('../../src/repositories/SitemapRepository.ts');
		const sitemap = new SitemapRepository(db);
		const forums = (await sitemap.listForums()).map((forum) => forum.id);
		expect(forums).toContain(2);
		expect(forums).not.toContain(3);
		expect(forums).not.toContain(4);
		const topics = (await sitemap.listTopics(10)).map((topic) => topic.id);
		expect(topics).toContain(10);
		expect(topics).not.toContain(11);
		expect(topics).not.toContain(12);
	});
});
