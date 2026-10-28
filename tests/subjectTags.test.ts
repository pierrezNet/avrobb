/**
 * Balises en tête de sujet affichées en pastilles colorées (services/subjectTags.ts).
 */

import { describe, expect, it } from 'vitest';
import { subjectSegments, tagColors } from '../src/services/subjectTags.ts';
import type { SubjectPart } from '../src/services/topicLabels.ts';

const plain = (text: string): SubjectPart => ({ text, style: null });
const css = () => null;

describe('pastilles de balises', () => {
	it('balises en tête, sans crochets, puis le titre', () => {
		expect(subjectSegments([plain('[MSFS] [Résolu]Panne moteur')], css)).toEqual([
			{ text: 'MSFS', css: null, tag: { background: '#1d4ed8', foreground: '#ffffff' } },
			{ text: 'Résolu', css: null, tag: { background: '#15803d', foreground: '#ffffff' } },
			{ text: 'Panne moteur', css: null, tag: null },
		]);
	});

	it('une balise au milieu du titre reste du texte', () => {
		expect(subjectSegments([plain('Panne [MSFS] moteur')], css)).toEqual([{ text: 'Panne [MSFS] moteur', css: null, tag: null }]);
	});

	it('balises inconnues : couleur stable tirée du nom, insensible à la casse', () => {
		expect(tagColors('BETA')).toEqual(tagColors('beta'));
		expect(tagColors('BETA').foreground).toBe('#ffffff');
		expect(tagColors('msfs').background).toBe('#1d4ed8');
	});

	it('balise PunBalise : sa couleur, texte lisible selon le fond', () => {
		const solved: SubjectPart = { text: '[Réglé]', style: { color: '#FFFF00', bold: true, italic: false, underline: false } };
		expect(subjectSegments([solved, plain(' Panne')], css)).toEqual([
			{ text: 'Réglé', css: null, tag: { background: '#FFFF00', foreground: '#1a1a1a' } },
			{ text: 'Panne', css: null, tag: null },
		]);
	});
});
