/**
 * Textes de la barre d'outils BBCode. Source : lang/French/fluxtoolbar.php (mod FluxToolBar).
 * Les bulles reprennent la syntaxe de la balise ; les questions sont posées par le navigateur.
 */

export const toolbar = {
	label: 'Mise en forme du message',
	allSmilies: 'Toutes les émoticônes',
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
	prompts: {
		quote: ["Veuillez entrer le nom de l'utilisateur cité (ou laissez vide) :"],
		link: ["Veuillez entrer l'URL de votre lien :", 'Veuillez entrer un nom descriptif de votre lien :'],
		img: ["Veuillez entrer l'URL de votre image :", 'Veuillez entrer une description pour votre image (attribut alt) :'],
		email: ['Veuillez entrer une adresse mail valide :', 'Veuillez entrer un nom descriptif de votre courriel :'],
		list: ['Veuillez entrer le type de liste : * = liste à puce, 1 = liste ordonnée numériquement, a = liste ordonnée alphabétiquement'],
		acronym: ["Désignation complète de l'acronyme :"],
		video: ["Veuillez entrer l'URL de votre vidéo youtube (watch ou embed) ou dailymotion (URL ou lien d'intégration)"],
	} as Readonly<Record<string, readonly string[]>>,

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
