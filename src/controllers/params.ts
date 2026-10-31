/**
 * Validation des paramètres de requête communs à tous les contrôleurs.
 */

import type { FormBody } from '../http/forms.ts';
import { MAX_SELECTED_ITEMS } from '../services/pagination.ts';

/** Identifiant ou numéro strictement positif (intval() de PHP sur une entrée utilisateur) ; 0 si invalide. */
export function positiveInt(value: string | undefined): number {
	if (value === undefined || !/^\s*\d+/.test(value)) return 0;

	const n = Number.parseInt(value, 10);
	return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

/**
 * Identifiants entiers positifs d'un champ répété (cases à cocher) ou d'une liste « 1,2,3 »,
 * MAX_SELECTED_ITEMS au plus : le surplus d'une requête forgée est ignoré.
 */
export function idList(body: FormBody | undefined, name: string): number[] {
	const raw = body?.[name];
	const values = raw === undefined ? [] : Array.isArray(raw) ? raw : raw.split(',');
	return [...new Set(values.map((value) => positiveInt(value.trim())).filter((id) => id > 0))].slice(0, MAX_SELECTED_ITEMS);
}
