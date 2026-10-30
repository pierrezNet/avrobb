/**
 * Textes de la page Apparence de l'administration (admin_appearance.php, propre à AvroBB).
 */

export const adminAppearance = {
	title: 'Apparence',
	intro:
		"Logo et bannière de l'en-tête du forum. L'image envoyée remplace celle du forum ; la précédente est gardée et peut être rétablie.",
	current: 'Image actuelle',
	file: 'Nouvelle image',
	send: 'Remplacer',
	restore: "Rétablir l'image précédente",
	replaced: 'Image remplacée.',
	restored: 'Image précédente rétablie.',
	noFile: "Choisissez l'image à envoyer.",
	badType: "Le fichier n'est pas une image lisible (JPEG, PNG, GIF ou WebP).",
	tooLarge: (width: number, height: number) =>
		`L'image dépasse ${width.toLocaleString('fr-FR')} × ${height.toLocaleString('fr-FR')} pixels : réduisez-la avant de l'envoyer.`,
	kinds: {
		logo: {
			title: 'Logo',
			help: 'Affiché en haut à gauche, sur 77 px de haut au plus. PNG ou WebP à fond transparent conseillé, 1 204 × 308 px au plus.',
		},
		banner: {
			title: 'Bannière (image de fond)',
			help: 'Affichée derrière le logo sur grand écran, sur toute la largeur et 124 px de haut, centrée et recadrée. Une image large (au moins 1 600 px, 2 560 × 800 px au plus) convient le mieux, en JPEG ou WebP.',
		},
	},
};
