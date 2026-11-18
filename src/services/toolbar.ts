/**
 * Barre d'outils BBCode : boutons proposés au-dessus d'un champ de message, d'après
 * generate_ftb_cache() du mod FluxToolBar. Fonctions pures ; le dessin et l'insertion des balises
 * sont faits dans le navigateur (public/js/toolbar.js), qui pose les questions dans une fenêtre
 * décrite ici (champs, aides, motifs des vidéos reconnues).
 *
 * La liste des boutons est fixée dans le code (TOOLBAR) ; les icônes sont des SVG d'AvroBB
 * (public/img/toolbar/<nom>.svg), dessinées en masque CSS pour suivre la couleur du thème.
 */

import { VIDEO_PLAYERS } from './bbcode.ts';

/**
 * Dossier des icônes. Les fichiers statiques sont servis avec un cache long sans empreinte ici :
 * changer le dessin d'une icône impose de changer son nom.
 */
const ICON_DIR = '/assets/img/toolbar/';

/**
 * Champ de la fenêtre d'un bouton (toolbar.js). `fill` : ce que reçoit le champ de la sélection du
 * message (une adresse, une adresse e-mail, ou le texte s'il n'a pas servi à un autre champ).
 */
export type ToolbarField =
	| {
			kind: 'url' | 'email' | 'text' | 'member';
			label: string;
			hint: string | null;
			required: boolean;
			fill: 'url' | 'email' | 'text' | null;
			/** Motifs (sources de RegExp) dont l'un doit reconnaître la valeur, et message sinon. */
			patterns: readonly string[];
			invalid: string | null;
			/** Aperçu de l'image dont le champ donne l'adresse. */
			preview: boolean;
	  }
	| { kind: 'choice'; label: string; hint: string | null; choices: readonly { value: string; label: string }[] };

/** Fenêtre ouverte par un bouton : les champs, dans l'ordre des réponses attendues par l'action. */
export interface ToolbarDialog {
	title: string;
	submit: string;
	cancel: string;
	fields: readonly ToolbarField[];
}

/** Action d'un bouton : func de toolbar_tags, ou bouton particulier. */
export type ToolbarAction =
	/** func 0 : [tag]sélection[/tag]. */
	| { kind: 'wrap'; tag: string }
	/** func 1 : [tag=réponse]sélection[/tag], [tag]sélection[/tag] sans réponse. */
	| { kind: 'argument'; tag: string; dialog: ToolbarDialog }
	/** func 2 : deux réponses ([url=adresse]texte[/url]) ; `reverse` pour [img=description]adresse[/img]. */
	| { kind: 'pair'; tag: string; dialog: ToolbarDialog; reverse: boolean }
	/** func 3 : [tag]réponse[/tag]. */
	| { kind: 'inside'; tag: string; dialog: ToolbarDialog }
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

/** Textes d'une fenêtre : titre, libellés et aides des champs, choix et message d'adresse refusée. */
export interface ToolbarDialogTexts {
	title: string;
	fields: readonly { label: string; hint?: string }[];
	choices?: Readonly<Record<string, string>>;
	invalid?: string;
}

export interface ToolbarTexts {
	buttons: Readonly<Record<string, string>>;
	dialogs: { submit: string; cancel: string; byButton: Readonly<Record<string, ToolbarDialogTexts>> };
}

type FieldSpec =
	| { kind: 'url' | 'email' | 'text' | 'member'; required: boolean; fill: 'url' | 'email' | 'text' | null; video?: true; preview?: true }
	| { kind: 'choice'; choices: readonly string[] };

/** Champs de chaque bouton qui pose des questions ; libellés dans lang/<langue>/toolbar.ts. */
const DIALOG_FIELDS: Readonly<Record<string, readonly FieldSpec[]>> = {
	link: [
		{ kind: 'url', required: true, fill: 'url' },
		{ kind: 'text', required: false, fill: 'text' },
	],
	email: [
		{ kind: 'email', required: true, fill: 'email' },
		{ kind: 'text', required: false, fill: 'text' },
	],
	img: [
		{ kind: 'url', required: true, fill: 'url', preview: true },
		{ kind: 'text', required: false, fill: null },
	],
	quote: [{ kind: 'member', required: false, fill: null }],
	list: [{ kind: 'choice', choices: ['*', '1', 'a'] }],
	acronym: [{ kind: 'text', required: true, fill: null }],
	video: [{ kind: 'url', required: true, fill: 'url', video: true }],
};

const VIDEO_PATTERNS = VIDEO_PLAYERS.map(([pattern]) => pattern.source);

function dialog(name: string, texts: ToolbarTexts['dialogs']): ToolbarDialog {
	const own = texts.byButton[name];
	const specs = DIALOG_FIELDS[name] ?? [];
	return {
		title: own?.title ?? name,
		submit: texts.submit,
		cancel: texts.cancel,
		fields: specs.map((spec, i): ToolbarField => {
			const label = own?.fields[i]?.label ?? name;
			const hint = own?.fields[i]?.hint ?? null;
			if (spec.kind === 'choice')
				return { kind: 'choice', label, hint, choices: spec.choices.map((value) => ({ value, label: own?.choices?.[value] ?? value })) };
			return {
				kind: spec.kind,
				label,
				hint,
				required: spec.required,
				fill: spec.fill,
				patterns: spec.video ? VIDEO_PATTERNS : [],
				invalid: spec.video ? (own?.invalid ?? null) : null,
				preview: spec.preview ?? false,
			};
		}),
	};
}

export interface ToolbarOptions {
	/** p_message_bbcode, p_message_img_tag, o_smilies. */
	bbcode: boolean;
	imgTag: boolean;
	smilies: boolean;
}

function action(button: ToolbarTag, texts: ToolbarTexts['dialogs']): ToolbarAction {
	if (button.name === 'color') return { kind: 'color' };
	const questions = (): ToolbarDialog => dialog(button.name, texts);
	if (button.name === 'img') return { kind: 'pair', tag: button.code, dialog: questions(), reverse: true };
	switch (button.func) {
		case 3:
			return { kind: 'inside', tag: button.code, dialog: questions() };
		case 2:
			return { kind: 'pair', tag: button.code, dialog: questions(), reverse: false };
		case 1:
			return { kind: 'argument', tag: button.code, dialog: questions() };
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
		action: tagRow.name === 'smilies' ? { kind: 'smilies' } : action(tagRow, texts.dialogs),
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
