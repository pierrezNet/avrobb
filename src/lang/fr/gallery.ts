/**
 * Textes de la galerie. Source : lang/French/gallery.php (propre à PV).
 */

import type { GalleryUploadError } from '../../services/gallery.ts';

const UPLOAD_ERRORS: Record<GalleryUploadError, string> = {
	noTitle: "Vous n'avez pas donné de titre à votre image.",
	titleTooLong: 'Le titre ne doit pas dépasser 40 caractères.',
	noDescription: "Vous n'avez pas donné de description à votre image.",
	descriptionTooLong: 'La description ne doit pas dépasser 2 000 caractères.',
	noFile: "Vous n'avez pas sélectionné de fichier à télécharger.",
	badType: "Le type du fichier n'est pas autorisé. Les types autorisés sont le JPG, le GIF, le PNG et le WebP.",
	tooLarge: 'La taille du fichier dépasse le maximum autorisé (1,5 Mio).',
	tooWide: "L'image dépasse 4 096 pixels de côté : réduisez-la avant de l'envoyer.",
	quota: 'Vous avez atteint la limite de 200 images dans la galerie. Supprimez-en pour en envoyer de nouvelles.',
};

export const gallery = {
	pageTitle: 'Galerie',
	pageDesc: 'Toutes les images envoyées par les membres',
	myImagesDesc: 'Les images que vous avez envoyées',
	addPicture: 'Ajouter une image',
	moderation: 'Modérer les images',
	allImages: 'Toutes les images',
	myImages: 'Mes images',
	addedAt: 'Envoyé le :',
	addedBy: 'Par :',
	description: 'Description',
	empty: 'La galerie ne contient aucune image.',
	open: (title: string) => `Voir l’image « ${title} » en grand`,

	// Envoi
	postTitle: 'Poster une image dans la galerie',
	imageUse:
		"Le formulaire ci-dessous vous permet d'envoyer une image dans la galerie du site. L'image doit être au format JPG, GIF, PNG ou WebP, avec une taille maximale de 1,5 Mio et 4 096 pixels de côté. N'oubliez pas d'ajouter un titre et une petite description de l'image.",
	imageRule:
		"L'équipe du site se réserve le droit de supprimer sans préavis votre image. Toutes images non conformes aux conditions d'utilisation du site seront supprimées. Tout abus sera immédiatement sanctionné.",
	titleField: 'Titre',
	descriptionField: 'Description',
	descriptionHelp: 'Indiquez une courte description de votre image (BBCode autorisé).',
	imageField: 'Votre image',
	required: '(obligatoire)',
	upload: 'Télécharger',
	uploadError: (error: GalleryUploadError) => UPLOAD_ERRORS[error],
	errorsTitle: "Erreurs dans l'envoi",
	errorsInfo: 'Les erreurs suivantes doivent être corrigées :',
	added: 'Votre image a été envoyée correctement.',
	guestsCannotAdd: 'Seuls les membres du site peuvent ajouter des images dans la galerie.',

	// Suppression
	deleteImage: "Supprimer l'image",
	deleteImageNamed: (title: string) => `Supprimer l’image « ${title} »`,
	confirmDelete: (title: string) => `Supprimer définitivement l’image « ${title} » de la galerie ?`,
	deleted: "L'image a été supprimée avec succès.",

	// Insertion dans un message (gallery.php?info=pick)
	pickerTitle: 'Insérer une image de la galerie',
	pickerInfo:
		'Choisissez une de vos images, ou envoyez-en une nouvelle (elle rejoint la galerie) : « Insérer » ajoute au message son titre, l’image et sa description.',
	insert: 'Insérer',
	insertNamed: (title: string) => `Insérer « ${title} » dans le message`,
	insertCode: (title: string) => `BBCode de « ${title} »`,
	inserted: 'Inséré dans le message.',
	closeWindow: 'Fermer cette fenêtre',
	noOwnImages: "Vous n'avez encore envoyé aucune image.",
	noMatchingImages: 'Aucune image ne correspond à cette recherche.',
	pickerSearch: 'Rechercher une image',
	searchLabel: 'Titre ou description',
	scopeLabel: 'Parmi',
	scopeMine: 'Mes images',
	scopeAll: 'Toute la galerie',
	searchButton: 'Rechercher',
	pickLabel: (title: string) => `Choisir « ${title} »`,
	by: (author: string) => `par ${author}`,
};
