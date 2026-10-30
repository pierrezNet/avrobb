/**
 * Balises en tête de sujet affichées en pastilles colorées (services/subjectTags.ts).
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_SUBJECT_TAGS as TAGS } from '../src/services/subjectTagConfig.ts';
import { subjectSegments, tagColors } from '../src/services/subjectTags.ts';

describe('pastilles de balises', () => {
	it('balises en tête, sans crochets, puis le titre', () => {
		expect(subjectSegments('[MSFS] [Résolu]Panne moteur', TAGS)).toEqual([
			{ text: 'MSFS', tag: { background: '#1d4ed8', foreground: '#ffffff' } },
			{ text: 'Résolu', tag: { background: '#15803d', foreground: '#ffffff' } },
			{ text: 'Panne moteur', tag: null },
		]);
	});

	it('une balise au milieu du titre reste du texte', () => {
		expect(subjectSegments('Panne [MSFS] moteur', TAGS)).toEqual([{ text: 'Panne [MSFS] moteur', tag: null }]);
	});

	it('balises inventées et doublons masqués dans les anciens sujets', () => {
		expect(subjectSegments('[BETA] [MSFS] [msfs] Optimisation', TAGS)).toEqual([
			{ text: 'MSFS', tag: { background: '#1d4ed8', foreground: '#ffffff' } },
			{ text: 'Optimisation', tag: null },
		]);
	});

	it('couleur réglée de la balise, texte lisible selon le fond', () => {
		expect(tagColors({ name: 'MSFS', group: 'simulator', color: '#1d4ed8' })).toEqual({ background: '#1d4ed8', foreground: '#ffffff' });
		expect(tagColors({ name: 'Jaune', group: 'other', color: '#ffeb3b' }).foreground).toBe('#1a1a1a');
	});
});

describe('hasSimulatorTag', () => {
	it('vrai seulement avec une balise de simulateur connue en tête du sujet', async () => {
		const { hasSimulatorTag } = await import('../src/services/subjectPrefixes.ts');
		expect(hasSimulatorTag('[MSFS] Panne moteur', TAGS)).toBe(true);
		expect(hasSimulatorTag('[Résolu][x-plane] Panne', TAGS)).toBe(true);
		expect(hasSimulatorTag('[Résolu] Panne moteur', TAGS)).toBe(false);
		expect(hasSimulatorTag('Panne [MSFS]', TAGS)).toBe(false);
		expect(hasSimulatorTag('[Inventée] Panne', TAGS)).toBe(false);
	});
});
