/**
 * Textes de la page d'administration des pages d'information (admin_pages.php, propre à AvroBB).
 */

export const adminPages = {
	title: "Pages d'information",
	intro: 'Les pages liées en bas de chaque page du forum. Tant qu’une page n’a pas été modifiée, elle affiche le texte proposé par AvroBB.',
	edit: 'Modifier',
	view: 'Voir la page',
	customized: 'Texte modifié',
	defaultText: 'Texte par défaut',
	editTitle: (page: string) => `Modifier « ${page} »`,
	pageTitle: 'Titre',
	pageIntro: 'Introduction',
	pageIntroHelp: 'Texte affiché sous le titre (facultatif).',
	body: 'Contenu',
	bodyHelp:
		'« ## Titre » ouvre une rubrique ; une ligne vide sépare deux paragraphes ; une ligne « [Libellé](adresse) » ajoute un lien (page du forum comme faq.php, ou adresse http(s)). Le texte est affiché tel quel, sans HTML ni BBCode.',
	save: 'Enregistrer',
	reset: 'Revenir au texte par défaut',
	resetHelp: 'Efface les modifications de cette page.',
	saved: 'Page enregistrée.',
	resetDone: 'La page affiche de nouveau le texte par défaut.',
	errors: {
		title: 'Le titre est obligatoire (80 caractères au plus).',
		intro: "L'introduction est trop longue (1 000 caractères au plus).",
		body: 'Le contenu doit compter au moins une rubrique (30 000 caractères au plus).',
	} as Record<string, string>,
};
