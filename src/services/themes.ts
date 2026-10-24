/**
 * Thèmes de Pilote-Virtuel (style/*.css du PHP), réduits ici à des feuilles de variables CSS
 * (public/css/themes/). Le choix du membre (users.style) n'est utilisé que s'il est connu : la valeur
 * vient de la base et finit dans une URL de feuille de style.
 */

export const THEMES = ['Air', 'Lagon', 'GreenDeal', 'GreenDark', 'GlowingRed', 'fiftyGrey'] as const;

export type Theme = (typeof THEMES)[number];

const isTheme = (style: string): style is Theme => (THEMES as readonly string[]).includes(style);

/** Thème du membre, sinon thème par défaut du forum (o_default_style), sinon Air. */
export function resolveTheme(userStyle: string, defaultStyle: string): Theme {
	if (isTheme(userStyle)) return userStyle;
	if (isTheme(defaultStyle)) return defaultStyle;
	return 'Air';
}
