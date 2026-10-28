/**
 * Formulaire d'une balise (plugin AP_Balises.php) : nom et couleur #RRGGBB obligatoires, style et
 * options lus comme le PHP.
 */

import type { LabelValues } from '../repositories/LabelAdminRepository.ts';
import { punTrim } from './phpString.ts';

export type LabelFormError = 'name' | 'color' | 'colorInvalid';

export function readLabelForm(
	read: (name: string) => string,
): { kind: 'ok'; values: LabelValues; position: number } | { kind: 'error'; error: LabelFormError } {
	const name = punTrim(read('nom'));
	const color = punTrim(read('color1'));
	if (name === '') return { kind: 'error', error: 'name' };
	if (color === '') return { kind: 'error', error: 'color' };
	if (!/^#[a-fA-F0-9]{6}$/.test(color)) return { kind: 'error', error: 'colorInvalid' };
	const style = Number.parseInt(read('baltype'), 10);
	return {
		kind: 'ok',
		values: {
			name,
			color,
			bold: read('gras') === '1',
			italic: read('ital') === '1',
			underline: read('souli') === '1',
			style: [0, 1, 2].includes(style) ? style : 0,
			moderatorVisible: read('affich') === '1',
		},
		position: Number.parseInt(read('position'), 10) || 0,
	};
}
