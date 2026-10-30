/**
 * Règles pures ajoutées par AvroBB : dernière IP d'un bannissement, avertissement sans balise de
 * projet, écritures d'un banni, seuil des discussions anciennes, image et projets de la
 * semaine (accueil), adresses versionnées du logo et de la bannière.
 */

import { describe, expect, it } from 'vitest';
import { readColdTopicsForm } from '../src/services/adminOptions.ts';
import { withLastIp } from '../src/services/banForm.ts';
import { headerImageHref } from '../src/services/headerImages.ts';
import { lastImageUrl, projectShares } from '../src/services/homeActivity.ts';
import { canWriteWhileBanned } from '../src/services/permissions.ts';
import { needsProjectTagWarning } from '../src/services/subjectPrefixes.ts';
import { TEST_SUBJECT_TAGS as TAGS } from './fixtures.ts';

describe('règles AvroBB', () => {
	it('bannissement : la dernière IP s’ajoute aux adresses saisies, sans doublon', () => {
		expect(withLastIp('', '192.0.2.5')).toBe('192.0.2.5');
		expect(withLastIp(' 10.1  10.2 ', '192.0.2.5')).toBe('10.1 10.2 192.0.2.5');
		expect(withLastIp('192.0.2.5', '192.0.2.5')).toBe('192.0.2.5');
		expect(withLastIp('10.1', '')).toBe('10.1');
	});

	it('nouvelle discussion : avertissement sans balise de projet, sauf confirmation', () => {
		expect(needsProjectTagWarning('Panne moteur', TAGS, false)).toBe(true);
		expect(needsProjectTagWarning('[Résolu] Panne', TAGS, false)).toBe(true);
		expect(needsProjectTagWarning('[MSFS] Panne', TAGS, false)).toBe(false);
		expect(needsProjectTagWarning('Panne moteur', TAGS, true)).toBe(false);
		expect(
			needsProjectTagWarning(
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

	it('accueil : projets de la semaine, du plus discuté au moins discuté', () => {
		const shares = projectShares(['[MSFS] A', '[MSFS][X-Plane] B', '[Résolu] C', '[X-Plane] D', '[MSFS] E'], TAGS);
		expect(shares.map((share) => [share.tag.name, share.count, share.percent])).toEqual([
			['MSFS', 3, 60],
			['X-Plane', 2, 40],
		]);
		expect(projectShares([], TAGS)).toEqual([]);
	});

	it('logo et bannière : version dans l’adresse après un remplacement', () => {
		expect(headerImageHref('logo', 0)).toBe('/img/logo.png');
		expect(headerImageHref('banner', 42)).toBe('/img/banner.jpg?v=42');
	});
});
