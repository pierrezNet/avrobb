/**
 * Validation des paramètres communs aux contrôleurs (controllers/params.ts).
 */

import { describe, expect, it } from 'vitest';
import { idList, positiveInt } from '../src/controllers/params.ts';
import { MAX_SELECTED_ITEMS } from '../src/services/pagination.ts';

describe('positiveInt()', () => {
	it('intval() d’une entrée utilisateur, 0 si invalide ou négatif', () => {
		expect(positiveInt('42')).toBe(42);
		expect(positiveInt(' 7abc')).toBe(7);
		expect(positiveInt('-3')).toBe(0);
		expect(positiveInt('abc')).toBe(0);
		expect(positiveInt(undefined)).toBe(0);
	});
});

describe('idList()', () => {
	it('cases à cocher ou liste « 1,2,3 », sans doublon ni valeur invalide', () => {
		expect(idList({ topics: ['3', '5', '3', 'x'] }, 'topics')).toEqual([3, 5]);
		expect(idList({ topics: '1, 2,0' }, 'topics')).toEqual([1, 2]);
		expect(idList(undefined, 'topics')).toEqual([]);
	});

	it('plafonnée : une page affiche 75 éléments au plus, D1 refuse plus de 100 paramètres', () => {
		const many = Array.from({ length: 500 }, (_, index) => String(index + 1));
		expect(idList({ topics: many }, 'topics')).toHaveLength(MAX_SELECTED_ITEMS);
	});
});
