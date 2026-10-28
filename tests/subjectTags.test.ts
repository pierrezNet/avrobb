/**
 * Balises en tête de sujet affichées en pastilles colorées (services/subjectTags.ts).
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_SUBJECT_TAGS as TAGS } from '../src/services/subjectTagConfig.ts';
import { subjectSegments, tagColors } from '../src/services/subjectTags.ts';
import type { SubjectPart } from '../src/services/topicLabels.ts';

const plain = (text: string): SubjectPart => ({ text, style: null });
const css = () => null;

describe('pastilles de balises', () => {
	it('balises en tête, sans crochets, puis le titre', () => {
		expect(subjectSegments([plain('[MSFS] [Résolu]Panne moteur')], css, TAGS)).toEqual([
			{ text: 'MSFS', css: null, tag: { background: '#1d4ed8', foreground: '#ffffff' } },
			{ text: 'Résolu', css: null, tag: { background: '#15803d', foreground: '#ffffff' } },
			{ text: 'Panne moteur', css: null, tag: null },
		]);
	});

	it('une balise au milieu du titre reste du texte', () => {
		expect(subjectSegments([plain('Panne [MSFS] moteur')], css, TAGS)).toEqual([{ text: 'Panne [MSFS] moteur', css: null, tag: null }]);
	});

	it('balises inventées et doublons masqués dans les anciens sujets', () => {
		expect(subjectSegments([plain('[BETA] [MSFS] [msfs] Optimisation')], css, TAGS)).toEqual([
			{ text: 'MSFS', css: null, tag: { background: '#1d4ed8', foreground: '#ffffff' } },
			{ text: 'Optimisation', css: null, tag: null },
		]);
	});

	it('couleur réglée de la balise, texte lisible selon le fond', () => {
		expect(tagColors({ name: 'MSFS', group: 'simulator', color: '#1d4ed8' })).toEqual({ background: '#1d4ed8', foreground: '#ffffff' });
		expect(tagColors({ name: 'Jaune', group: 'other', color: '#ffeb3b' }).foreground).toBe('#1a1a1a');
	});

	it('balise PunBalise : sa couleur, texte lisible selon le fond', () => {
		const solved: SubjectPart = { text: '[Réglé]', style: { color: '#FFFF00', bold: true, italic: false, underline: false } };
		expect(subjectSegments([solved, plain(' Panne')], css, TAGS)).toEqual([
			{ text: 'Réglé', css: null, tag: { background: '#FFFF00', foreground: '#1a1a1a' } },
			{ text: 'Panne', css: null, tag: null },
		]);
	});
});
