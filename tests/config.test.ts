/**
 * Configuration du forum : conversion typée des options, cache mémoire de courte durée et
 * invalidation ; statistiques des membres.
 */

import { describe, expect, it } from 'vitest';
import { ConfigLoader } from '../src/repositories/ConfigLoader.ts';
import { UsersInfoLoader } from '../src/repositories/UsersInfoLoader.ts';
import { toBoardConfig } from '../src/services/boardConfig.ts';

describe('toBoardConfig', () => {
	it('convertit les options en réglages typés', () => {
		const config = toBoardConfig(
			new Map([
				['o_board_title', 'AvroBB'],
				['o_default_style', 'GreenDark'],
				['o_feed_type', '2'],
				['o_announcement', '1'],
				['o_announcement_message', '<p>Annonce</p>'],
			]),
		);
		expect(config).toMatchObject({
			boardTitle: 'AvroBB',
			defaultStyle: 'GreenDark',
			feedType: 'none',
			announcement: '<p>Annonce</p>',
			reportsByBoard: true,
		});
		expect(toBoardConfig(new Map([['o_report_method', '1']])).reportsByBoard).toBe(false);
		// Ancien choix Atom (2) : plus de lien de flux ; RSS (1) seulement.
		expect(toBoardConfig(new Map([['o_feed_type', '1']])).feedType).toBe('rss');
		expect(toBoardConfig(new Map()).announcement).toBeNull();
	});
});

function setup() {
	let now = 1000;
	let dbReads = 0;
	const dbValues = new Map([['o_board_title', 'Titre en base']]);
	const loader = new ConfigLoader(
		{
			loadValues: async () => {
				dbReads++;
				return dbValues;
			},
		},
		() => now,
	);
	return { loader, dbValues, tick: (s: number) => (now += s), dbReads: () => dbReads };
}

describe('ConfigLoader', () => {
	it('garde les réglages en mémoire une trentaine de secondes', async () => {
		const { loader, dbValues, tick, dbReads } = setup();

		expect((await loader.load()).boardTitle).toBe('Titre en base');
		dbValues.set('o_board_title', 'Modifié');
		tick(29);
		expect((await loader.load()).boardTitle).toBe('Titre en base');
		tick(1);
		expect((await loader.load()).boardTitle).toBe('Modifié');
		expect(dbReads()).toBe(2);
	});

	it('invalidate() relit la base dès la requête suivante', async () => {
		const { loader, dbValues } = setup();
		await loader.load();
		dbValues.set('o_board_title', 'Modifié');
		await loader.invalidate();
		expect((await loader.load()).boardTitle).toBe('Modifié');
	});
});

describe('UsersInfoLoader', () => {
	it('relit la base au plus une fois par minute', async () => {
		let now = 1000;
		let dbReads = 0;
		const loader = new UsersInfoLoader(
			{
				loadUsersInfo: async () => {
					dbReads++;
					return { totalUsers: 9, newestUser: { id: 2, username: 'admin' } };
				},
			},
			() => now,
		);

		expect(await loader.load()).toEqual({ totalUsers: 9, newestUser: { id: 2, username: 'admin' } });
		now += 59;
		await loader.load();
		expect(dbReads).toBe(1);
		now += 1;
		await loader.load();
		expect(dbReads).toBe(2);
	});
});
