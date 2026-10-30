/**
 * Les 6 thèmes définissent toutes les variables attendues par base.css, et chaque couple
 * texte / fond atteint le contraste AA (4,5:1) des WCAG.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEMES } from '../src/services/themes.ts';

const THEMES_DIR = path.join(import.meta.dirname, '..', 'public', 'assets', 'css', 'themes');

function readVariables(theme: string): Map<string, string> {
	const css = readFileSync(path.join(THEMES_DIR, `${theme}.css`), 'utf8');
	return new Map([...css.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(([, name = '', value = '']) => [name, value.toLowerCase()]));
}

/** Luminance relative WCAG 2.x d'une couleur #rrggbb. */
function luminance(hex: string): number {
	const channel = (offset: number): number => {
		const c = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
		return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
	const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
	return (light + 0.05) / (dark + 0.05);
}

const PAIRS: [foreground: string, background: string][] = [
	['text', 'surface'],
	['text', 'surface-alt'],
	['text', 'code-bg'],
	['text', 'quote-bg'],
	['muted', 'surface'],
	['muted', 'surface-alt'],
	['link', 'surface'],
	['link', 'surface-alt'],
	['link', 'quote-bg'],
	['accent-text', 'accent'],
	['header-text', 'header-bg'],
	// Fin du dégradé de l'en-tête et du menu mobile.
	['header-text', 'accent'],
	['header-text', 'active'],
	['button-text', 'button-bg'],
];

describe.each(THEMES)('thème %s', (theme) => {
	const vars = readVariables(theme);

	it('définit toutes les couleurs', () => {
		for (const name of new Set(PAIRS.flat().concat(['bg', 'border', 'focus', 'link-hover'])))
			expect(vars.has(`color-${name}`), `--color-${name}`).toBe(true);
	});

	it.each(PAIRS)('contraste AA : %s sur %s', (foreground, background) => {
		const ratio = contrast(vars.get(`color-${foreground}`) ?? '#000000', vars.get(`color-${background}`) ?? '#000000');
		expect(ratio, `${foreground} sur ${background} : ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
	});
});
