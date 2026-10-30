/**
 * Barre d'outils BBCode : boutons proposés au-dessus d'un champ de message, d'après
 * generate_ftb_cache() du mod FluxToolBar. Fonctions pures ; le dessin et l'insertion des balises
 * sont faits dans le navigateur (public/js/toolbar.js).
 *
 * La liste des boutons est fixée dans le code (TOOLBAR) ; les icônes sont des SVG d'AvroBB
 * (public/img/toolbar/<nom>.svg), dessinées en masque CSS pour suivre la couleur du thème.
 */

/**
 * Dossier des icônes. Les fichiers statiques sont servis avec un cache long sans empreinte ici :
 * changer le dessin d'une icône impose de changer son nom.
 */
const ICON_DIR = '/assets/img/toolbar/';

/** Action d'un bouton : func de toolbar_tags, ou bouton particulier. */
export type ToolbarAction =
	/** func 0 : [tag]sélection[/tag]. */
	| { kind: 'wrap'; tag: string }
	/** func 1 : [tag=réponse]sélection[/tag]. */
	| { kind: 'argument'; tag: string; prompts: readonly string[] }
	/** func 2 : deux réponses ([url=adresse]texte[/url]) ; `reverse` pour [img=description]adresse[/img]. */
	| { kind: 'pair'; tag: string; prompts: readonly string[]; reverse: boolean }
	/** func 3 : [tag]réponse[/tag]. */
	| { kind: 'inside'; tag: string; prompts: readonly string[] }
	| { kind: 'color' }
	| { kind: 'smilies' };

export interface ToolbarTag {
	name: string;
	code: string;
	func: number;
	image: string;
	enableForm: boolean;
	enableQuick: boolean;
}

export interface ToolbarSettings {
	enableForm: boolean;
	enableQuick: boolean;
	/** Boutons dans l'ordre d'affichage. */
	tags: readonly ToolbarTag[];
}

const tag = (name: string, code: string, func: number): ToolbarTag => ({
	name,
	code,
	func,
	image: `${name}.svg`,
	enableForm: true,
	enableQuick: true,
});

/** Boutons de la barre, ceux de FluxToolBar complétés des balises propres au forum. */
export const TOOLBAR: ToolbarSettings = {
	enableForm: true,
	enableQuick: true,
	tags: [
		tag('smilies', '', 0),
		tag('bold', 'b', 0),
		tag('italic', 'i', 0),
		tag('underline', 'u', 0),
		tag('strike', 's', 0),
		tag('color', 'color', 0),
		tag('heading', 'h', 0),
		tag('link', 'url', 2),
		tag('email', 'email', 2),
		tag('img', 'img', 2),
		tag('quote', 'quote', 1),
		tag('code', 'code', 0),
		tag('list', 'list', 1),
		tag('li', '*', 0),
		tag('sup', 'sup', 0),
		tag('sub', 'sub', 0),
		tag('q', 'q', 0),
		tag('acronym', 'acronym', 1),
		tag('left', 'left', 0),
		tag('center', 'center', 0),
		tag('right', 'right', 0),
		tag('justify', 'justify', 0),
		tag('video', 'video', 3),
	],
};

export interface ToolbarButton {
	name: string;
	label: string;
	/** Fichier de l'icône dans ICON_DIR (vide : libellé seul). */
	image: string;
	action: ToolbarAction;
}

export interface Toolbar {
	/** Dossier des icônes (adresse absolue). */
	imageDir: string;
	buttons: ToolbarButton[];
}

export interface ToolbarTexts {
	buttons: Readonly<Record<string, string>>;
	prompts: Readonly<Record<string, readonly string[]>>;
}

export interface ToolbarOptions {
	/** p_message_bbcode, p_message_img_tag, o_smilies. */
	bbcode: boolean;
	imgTag: boolean;
	smilies: boolean;
}

function action(button: ToolbarTag, prompts: readonly string[]): ToolbarAction {
	if (button.name === 'img') return { kind: 'pair', tag: button.code, prompts, reverse: true };
	if (button.name === 'color') return { kind: 'color' };
	switch (button.func) {
		case 3:
			return { kind: 'inside', tag: button.code, prompts };
		case 2:
			return { kind: 'pair', tag: button.code, prompts, reverse: false };
		case 1:
			return { kind: 'argument', tag: button.code, prompts };
		default:
			return { kind: 'wrap', tag: button.code };
	}
}

/**
 * Boutons d'un formulaire (post.php : `form`, réponse rapide : `quickform`), ou null si la barre y
 * est désactivée. Comme le PHP : émoticônes seulement si o_smilies (et toujours en dernier), image
 * seulement avec [img], le reste seulement avec le BBCode.
 */
export function toolbarButtons(
	settings: ToolbarSettings,
	form: 'form' | 'quickform',
	options: ToolbarOptions,
	texts: ToolbarTexts,
): Toolbar | null {
	if (!(form === 'form' ? settings.enableForm : settings.enableQuick)) return null;

	const button = (tagRow: ToolbarTag): ToolbarButton => ({
		name: tagRow.name,
		label: texts.buttons[tagRow.name] ?? tagRow.name,
		image: tagRow.image,
		action:
			tagRow.name === 'smilies'
				? { kind: 'smilies' }
				: action(tagRow, texts.prompts[tagRow.name] ?? [texts.buttons[tagRow.name] ?? tagRow.name]),
	});

	const enabled = settings.tags.filter((tagRow) => (form === 'form' ? tagRow.enableForm : tagRow.enableQuick));
	const buttons = enabled
		.filter((tagRow) => {
			if (tagRow.name === 'smilies') return false;
			if (tagRow.name === 'img') return options.imgTag;
			return options.bbcode;
		})
		.map(button);
	const smilies = enabled.find((tagRow) => tagRow.name === 'smilies');
	if (smilies !== undefined && options.smilies) buttons.push(button(smilies));
	return { imageDir: ICON_DIR, buttons };
}
