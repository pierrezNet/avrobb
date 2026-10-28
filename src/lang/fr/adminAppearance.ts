/**
 * Textes de la page Apparence de l'administration (admin_appearance.php, propre à AvroBB).
 */

export const adminAppearance = {
	title: 'Apparence',
	intro:
		"Logo et bannière de l'en-tête du forum. L'image envoyée remplace celle du forum (pour Node comme pour le PHP) ; la précédente est gardée et peut être rétablie.",
	current: 'Image actuelle',
	file: 'Nouvelle image',
	send: 'Remplacer',
	restore: "Rétablir l'image précédente",
	replaced: 'Image remplacée.',
	restored: 'Image précédente rétablie.',
	noFile: "Choisissez l'image à envoyer.",
	badType: "Le fichier n'est pas une image lisible (JPEG, PNG, GIF ou WebP).",
	kinds: {
		logo: {
			title: 'Logo',
			help: 'Affiché en haut à gauche, sur 77 px de haut au plus. PNG à fond transparent conseillé ; il est réduit au besoin et enregistré en PNG.',
		},
		banner: {
			title: 'Bannière (image de fond)',
			help: 'Affichée derrière le logo sur grand écran, sur toute la largeur et 124 px de haut, centrée et recadrée. Une image large (au moins 1 600 px) convient le mieux ; elle est enregistrée en JPEG.',
		},
	},
};
