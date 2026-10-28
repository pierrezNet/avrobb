/**
 * Règles pures ajoutées par AvroBB : dernière IP d'un bannissement, avertissement sans balise de
 * simulateur, écritures d'un banni, seuil des discussions anciennes, image et simulateurs de la
 * semaine (accueil), adresses versionnées du logo et de la bannière.
 */

import { describe, expect, it } from 'vitest';
import { readColdTopicsForm } from '../src/services/adminOptions.ts';
import { withLastIp } from '../src/services/banForm.ts';
import { headerImageHref } from '../src/services/headerImages.ts';
import { lastImageUrl, simulatorShares } from '../src/services/homeActivity.ts';
import { canWriteWhileBanned } from '../src/services/permissions.ts';
import { needsSimulatorTagWarning } from '../src/services/subjectPrefixes.ts';
import { DEFAULT_SUBJECT_TAGS as TAGS } from '../src/services/subjectTagConfig.ts';

describe('règles AvroBB', () => {
	it('bannissement : la dernière IP s’ajoute aux adresses saisies, sans doublon', () => {
		expect(withLastIp('', '192.0.2.5')).toBe('192.0.2.5');
		expect(withLastIp(' 10.1  10.2 ', '192.0.2.5')).toBe('10.1 10.2 192.0.2.5');
		expect(withLastIp('192.0.2.5', '192.0.2.5')).toBe('192.0.2.5');
		expect(withLastIp('10.1', '')).toBe('10.1');
	});

	it('nouvelle discussion : avertissement sans balise de simulateur, sauf confirmation', () => {
		expect(needsSimulatorTagWarning('Panne moteur', TAGS, false)).toBe(true);
		expect(needsSimulatorTagWarning('[Résolu] Panne', TAGS, false)).toBe(true);
		expect(needsSimulatorTagWarning('[MSFS] Panne', TAGS, false)).toBe(false);
		expect(needsSimulatorTagWarning('Panne moteur', TAGS, true)).toBe(false);
		expect(
			needsSimulatorTagWarning(
				'Panne',
				TAGS.filter((tag) => tag.group === 'other'),
				false,
			),
		).toBe(false);
	});

	it('banni : connexion, lu/non lu et abonnements seulement', () => {
		expect(canWriteWhileBanned('/login.php', {})).toBe(true);
		expect(canWriteWhileBanned('/misc.php', {})).toBe(true);
		expect(canWriteWhileBanned('/misc.php', { report: '12' })).toBe(false);
		expect(canWriteWhileBanned('/misc.php', { email: '3' })).toBe(false);
		expect(canWriteWhileBanned('/post.php', {})).toBe(false);
	});

	it('discussions anciennes : nombre entier de jours', () => {
		const read = (value: string) => () => value;
		expect(readColdTopicsForm(read(' 090 '))).toEqual(new Map([['o_cold_topic_days', '90']]));
		expect(readColdTopicsForm(read('0'))).toEqual(new Map([['o_cold_topic_days', '0']]));
		expect(readColdTopicsForm(read('-3'))).toBeNull();
		expect(readColdTopicsForm(read('12345'))).toBeNull();
	});

	it('accueil : dernière image http(s) d’un message', () => {
		expect(lastImageUrl('[img]http://a.test/1.png[/img] puis [img=vue]https://a.test/2.webp[/img]')).toBe('https://a.test/2.webp');
		expect(lastImageUrl('[img]javascript:alert(1)[/img]')).toBeNull();
		expect(lastImageUrl('Pas d’image')).toBeNull();
	});

	it('accueil : simulateurs de la semaine, du plus discuté au moins discuté', () => {
		const shares = simulatorShares(['[MSFS] A', '[MSFS][X-Plane] B', '[Résolu] C', '[X-Plane] D', '[MSFS] E'], TAGS);
		expect(shares.map((share) => [share.tag.name, share.count, share.percent])).toEqual([
			['MSFS', 3, 60],
			['X-Plane', 2, 40],
		]);
		expect(simulatorShares([], TAGS)).toEqual([]);
	});

	it('logo et bannière : version dans l’adresse après un remplacement', () => {
		expect(headerImageHref('logo', 0)).toBe('img/logo.png');
		expect(headerImageHref('banner', 42)).toBe('style/imports/img/banner.jpg?v=42');
	});
});
