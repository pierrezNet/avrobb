/**
 * Textes de l'aide BBCode. Source : lang/French/help.php (le HTML des chaînes d'origine, comme
 * « <strong>img</strong> », est remplacé par des guillemets). La section « Balises de
 * Pilote-Virtuel » est un ajout : le PHP ne documente pas les balises de son mod FluxToolBar.
 */

export const help = {
	help: 'Aide',
	produces: 'génère',
	and: 'et',
	bbcode: 'BBCode',
	bbcodeInfo1:
		"Le BBCode est une collection de balises de formatage utilisées pour modifier l'apparence du texte ou ajouter des éléments graphiques sur ces forums. BBCode est basé sur le même principe que le HTML, et y ressemble donc beaucoup. Il suffit d'encadrer les parties que l'on souhaite modifier/ajouter par des balises ([nom_de_balise]partie à modifier[/nom_de_balise]). Ci-dessous la liste de toutes les balises BBCodes disponibles et les instructions d'utilisation.",
	bbcodeInfo2:
		"Les administrateurs ont la possibilité d'activer ou de désactiver le système BBCode. Vous pouvez vérifier si le BBCode est activé lors de la composition d'un message ou la modification de votre signature.",
	textStyle: 'Style du texte',
	textStyleInfo: "Les balises suivantes changent l'apparence du texte :",
	boldText: 'Texte en gras',
	underlinedText: 'Texte souligné',
	italicText: 'Texte en italique',
	strikeText: 'Texte barré',
	redText: 'Texte rouge',
	blueText: 'Texte bleu',
	headingText: 'Titre',
	deletedText: 'Texte supprimé',
	insertedText: 'Texte inséré',
	emphasisedText: 'Texte en emphase',
	linksAndImages: 'Liens et images',
	thisHelpPage: "Cette page d'aide",
	linksInfo: "Vous pouvez créer des liens vers d'autres documents ou vers des adresses électroniques en utilisant les balises suivantes :",
	myEmailAddress: 'Mon adresse électronique',
	imagesInfo:
		"Si vous souhaitez afficher une image, vous pouvez utiliser la balise « img ». Le texte après le signe « = » dans la balise ouvrante est utilisé pour l'attribut alt (texte alternatif en cas de non affichage de l'image) et devrait être ajouté à chaque fois que cela est possible",
	bbcodeTest: 'Test du bbcode FluxBB',
	testTopic: 'Discussion de test',
	testPost: 'Message de test',
	testForum: 'Forum de test',
	testUser: 'Utilisateur de test',
	quotes: 'Citations',
	quotesInfo: "Si vous souhaitez inclure une citation de quelqu'un, vous devriez utiliser la balise « quote ».",
	quotesInfo2: "Si vous ne souhaitez pas citer quelqu'un en particulier, vous pouvez utiliser la balise « quote » sans spécifier de nom.",
	quoteText: 'Voici le texte que je veux citer.',
	quoteNote: "Remarque : si un nom d'utilisateur contient les caractères [ ou ] vous pouvez les délimiter par des guillemets.",
	code: 'Code',
	codeInfo:
		"Lorsque vous affichez du code source vous devriez vous assurer que vous utilisez la balise « code ». Le texte affiché entre les balises code utilise une police de caractères à chasse fixe et n'est pas affecté par les autres balises.",
	codeText: 'Voici un peu de code.',
	nestedTags: 'Balises imbriquées',
	nestedTagsInfo: "Les balises BBCode peuvent s'imbriquer afin de réaliser un formatage avancé. Par exemple :",
	boldUnderlined: 'Texte gras et souligné',
	lists: 'Listes',
	listInfo: 'Pour créer une liste vous pouvez utiliser la balise « list ». Trois types de listes sont à votre disposition.',
	listText1: 'Exemple de premier élément de liste.',
	listText2: 'Exemple de deuxième élément de liste.',
	listText3: 'Exemple de troisième élément de liste.',
	pvTags: 'Balises de Pilote-Virtuel',
	pvTagsInfo: 'Le forum reconnaît aussi ces balises, proposées par la barre d’outils de rédaction :',
	centeredText: 'Texte centré',
	hiddenText: 'Fin du film : le pilote atterrit.',
	videoInfo:
		'La balise « video » intègre une vidéo YouTube, Dailymotion ou Vimeo à partir de son adresse : [video]https://www.youtube.com/watch?v=…[/video].',
	smilies: 'Émoticônes',
	smiliesInfo:
		'Si vous le souhaitez (et si cette fonctionnalité est activée), les forums convertissent les émoticônes suivantes en émojis :',
};
