/**
 * Barre d'outils BBCode (mod FluxToolBar) : boutons proposés au-dessus d'un champ de message,
 * d'après generate_ftb_cache() de include/cache_fluxtoolbar.php. Fonctions pures ; le dessin et
 * l'insertion des balises sont faits dans le navigateur (public/js/toolbar.js).
 *
 * Les réglages de l'administrateur (toolbar_conf, toolbar_tags) sont suivis s'ils existent ; sinon
 * (tables vides, comme sur une base de test) on reprend les boutons livrés avec le mod et PV.
 */

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
	/** Jeu d'icônes (img/fluxtoolbar/<pack>/). */
	imagePack: string;
	/** Boutons dans l'ordre de leur position. */
	tags: readonly ToolbarTag[];
}

const tag = (name: string, code: string, func: number, image: string): ToolbarTag => ({
	name,
	code,
	func,
	image: `bt_${image}.png`,
	enableForm: true,
	enableQuick: true,
});

/** Boutons livrés avec FluxToolBar, complétés des balises ajoutées par PV. */
export const DEFAULT_TOOLBAR: ToolbarSettings = {
	enableForm: true,
	enableQuick: true,
	imagePack: 'smooth',
	tags: [
		tag('smilies', '', 0, 'smilies'),
		tag('bold', 'b', 0, 'bold'),
		tag('italic', 'i', 0, 'italic'),
		tag('underline', 'u', 0, 'underline'),
		tag('strike', 's', 0, 'strike'),
		tag('color', 'color', 0, 'color'),
		tag('heading', 'h', 0, 'size_plus'),
		tag('link', 'url', 2, 'link'),
		tag('email', 'email', 2, 'email'),
		tag('img', 'img', 2, 'img'),
		tag('quote', 'quote', 1, 'quote'),
		tag('code', 'code', 0, 'pre'),
		tag('list', 'list', 1, 'ul'),
		tag('li', '*', 0, 'li'),
		tag('sup', 'sup', 0, 'sup'),
		tag('sub', 'sub', 0, 'sub'),
		tag('q', 'q', 0, 'bquote'),
		tag('acronym', 'acronym', 1, 'acronym'),
		tag('left', 'left', 0, 'align_left'),
		tag('center', 'center', 0, 'align_center'),
		tag('right', 'right', 0, 'align_right'),
		tag('justify', 'justify', 0, 'align_justify'),
		tag('video', 'video', 3, 'video'),
	],
};

export interface ToolbarButton {
	name: string;
	label: string;
	/** Fichier de l'icône dans img/fluxtoolbar/<pack>/ (vide : libellé seul). */
	image: string;
	action: ToolbarAction;
}

export interface Toolbar {
	/** Dossier des icônes, relatif à la racine de l'installation PHP. */
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
	return { imageDir: `img/fluxtoolbar/${settings.imagePack}/`, buttons };
}
