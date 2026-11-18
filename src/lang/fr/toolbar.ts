/**
 * Textes de la barre d'outils BBCode. Source : lang/French/fluxtoolbar.php (mod FluxToolBar).
 * Les bulles reprennent la syntaxe de la balise ; les questions sont posées dans une fenêtre (js/toolbar.js).
 */

export const toolbar = {
	label: 'Mise en forme du message',
	buttons: {
		smilies: 'Cliquez ici pour afficher la barre d’émoticônes',
		bold: 'Texte en gras : [b]texte[/b]',
		italic: 'Texte en italique : [i]texte[/i]',
		underline: 'Texte souligné : [u]texte[/u]',
		strike: 'Texte barré : [s]texte[/s]',
		color: 'Couleur du texte : [color=#000000]texte[/color]',
		heading: 'Titre : [h]texte[/h]',
		quote: 'Bloc de citation : [quote=user]texte[/quote]',
		code: 'Texte préformaté : [code]texte[/code]',
		link: 'Lien : [url=http://www.website.ltd/]un site[/url]',
		img: 'Image : [img=texte]http://www.website.ltd/url-image.png[/img]',
		email: 'Courriel : [email=name@host.ltd]email[/email]',
		list: 'Liste : [list=*,1,a]text[/list]',
		li: 'Elément de liste : [*]text[/*]',
		acronym: 'Acronyme : [acronym=World Wide Web Consortium]W3C[/acronym]',
		q: 'Citation en ligne : [q]texte[/q]',
		sup: 'Exposant : [sup]texte[/sup]',
		sub: 'Indice : [sub]texte[/sub]',
		left: 'Aligner à gauche : [left]texte[/left]',
		right: 'Aligner à droite : [right]texte[/right]',
		center: 'Centrer : [center]texte[/center]',
		justify: 'Justifier : [justify]texte[/justify]',
		video: 'Vidéo : [video]vidéo[/video]',
	} as Readonly<Record<string, string>>,
	/** Fenêtres des boutons qui posent des questions (js/toolbar.js), champs dans l'ordre de services/toolbar.ts. */
	dialogs: {
		submit: 'Insérer',
		cancel: 'Annuler',
		byButton: {
			link: {
				title: 'Insérer un lien',
				fields: [{ label: 'Adresse du lien' }, { label: 'Texte affiché', hint: 'Facultatif : l’adresse est affichée sinon.' }],
			},
			email: {
				title: 'Insérer une adresse e-mail',
				fields: [{ label: 'Adresse e-mail' }, { label: 'Texte affiché', hint: 'Facultatif : l’adresse est affichée sinon.' }],
			},
			img: {
				title: 'Insérer une image par son adresse',
				fields: [
					{ label: 'Adresse de l’image' },
					{ label: 'Description de l’image', hint: 'Facultatif : lue à la place de l’image par les lecteurs d’écran.' },
				],
			},
			quote: { title: 'Insérer une citation', fields: [{ label: 'Auteur cité', hint: 'Facultatif.' }] },
			list: {
				title: 'Insérer une liste',
				fields: [{ label: 'Type de liste', hint: 'Chaque ligne sélectionnée devient un élément.' }],
				choices: { '*': 'À puces (•)', '1': 'Numérotée (1, 2, 3)', a: 'Alphabétique (a, b, c)' },
			},
			acronym: { title: 'Insérer un acronyme', fields: [{ label: 'Signification', hint: 'Par exemple : World Wide Web Consortium.' }] },
			video: {
				title: 'Insérer une vidéo',
				fields: [{ label: 'Adresse de la vidéo', hint: 'YouTube, Dailymotion ou Vimeo.' }],
				invalid: 'Adresse non reconnue : seules les vidéos YouTube, Dailymotion et Vimeo sont intégrées.',
			},
		},
	},

	/** Bouton image : choix de la source (absent de FluxToolBar). */
	imageChooser: {
		label: 'Insérer une image',
		url: 'Adresse d’une image (URL)',
		gallery: 'Mes images de la galerie',
		upload: 'Nouvelle image (envoi)',
		dialogTitle: 'Insérer une image de la galerie',
		close: 'Fermer',
		insertAndClose: 'Insérer et fermer',
	},
};
