/**
 * Émoticônes : do_smilies() de include/parser.php, avec des émojis Unicode au lieu des images.
 *
 * Depuis la « modification post migration » de PV, do_smilies() n'utilise plus que la liste codée en
 * dur de parser.php (18 codes) : les émoticônes GIF de la table smilies ne sont plus rendues dans les
 * messages. On reprend exactement ces 18 codes, rendus en émojis (choix du projet : aucune image).
 */

export interface Smiley {
	code: string;
	emoji: string;
	/** Nom de l'image d'origine (img/smilies/<nom>.png), repris comme libellé accessible. */
	name: string;
}

export const SMILIES: readonly Smiley[] = [
	{ code: ':)', emoji: '🙂', name: 'smile' },
	{ code: '=)', emoji: '🙂', name: 'smile' },
	{ code: ':|', emoji: '😐', name: 'neutral' },
	{ code: '=|', emoji: '😐', name: 'neutral' },
	{ code: ':(', emoji: '🙁', name: 'sad' },
	{ code: '=(', emoji: '🙁', name: 'sad' },
	{ code: ':D', emoji: '😃', name: 'big_smile' },
	{ code: '=D', emoji: '😃', name: 'big_smile' },
	{ code: ':o', emoji: '😮', name: 'yikes' },
	{ code: ':O', emoji: '😮', name: 'yikes' },
	{ code: ';)', emoji: '😉', name: 'wink' },
	{ code: ':/', emoji: '😕', name: 'hmm' },
	{ code: ':P', emoji: '😛', name: 'tongue' },
	{ code: ':p', emoji: '😛', name: 'tongue' },
	{ code: ':lol:', emoji: '😂', name: 'lol' },
	{ code: ':mad:', emoji: '😠', name: 'mad' },
	{ code: ':rolleyes:', emoji: '🙄', name: 'roll' },
	{ code: ':cool:', emoji: '😎', name: 'cool' },
];

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// Même motif que do_smilies() : précédé d'un blanc ou d'une fin de balise, suivi d'un caractère
// qui n'est ni une lettre ni un chiffre (le texte est encadré d'espaces pour les extrémités).
const PATTERNS = SMILIES.map((smiley) => ({
	smiley,
	pattern: new RegExp(`(?<=[>\\s])${escapeRegExp(smiley.code)}(?=[^\\p{L}\\p{N}])`, 'gmu'),
}));

/** Remplace les codes d'émoticônes dans du HTML déjà échappé. */
export function doSmilies(html: string): string {
	let text = ` ${html} `;

	for (const { smiley, pattern } of PATTERNS) {
		if (text.includes(smiley.code))
			text = text.replace(pattern, `<span class="smiley" role="img" aria-label="${smiley.name}">${smiley.emoji}</span>`);
	}

	return text.slice(1, -1);
}
