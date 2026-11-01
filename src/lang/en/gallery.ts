/**
 * English translation of src/lang/fr/gallery.ts (gallery texts).
 */

import type { GalleryUploadError } from '../../services/gallery.ts';
import type { gallery as frGallery } from '../fr/gallery.ts';

const UPLOAD_ERRORS: Record<GalleryUploadError, string> = {
	noTitle: "You didn't give your image a title.",
	titleTooLong: 'The title must not exceed 40 characters.',
	noDescription: "You didn't give your image a description.",
	descriptionTooLong: 'The description must not exceed 2,000 characters.',
	noFile: "You didn't select a file to upload.",
	badType: 'This file type is not allowed. Allowed types are JPG, GIF, PNG and WebP.',
	tooLarge: 'The file is larger than the maximum allowed size (1.5 MiB).',
	tooWide: 'The image is larger than 4,096 pixels on a side: shrink it before uploading.',
	quota: 'You have reached the limit of 200 images in the gallery. Delete some to upload new ones.',
};

export const gallery: typeof frGallery = {
	pageTitle: 'Gallery',
	pageDesc: 'All images uploaded by members',
	myImagesDesc: 'The images you have uploaded',
	addPicture: 'Add an image',
	moderation: 'Moderate images',
	allImages: 'All images',
	myImages: 'My images',
	addedAt: 'Uploaded on:',
	addedBy: 'By:',
	description: 'Description',
	empty: 'The gallery has no images.',
	open: (title: string) => `View the image “${title}” full size`,

	// Upload
	postTitle: 'Post an image to the gallery',
	imageUse:
		"Use the form below to upload an image to the site's gallery. The image must be JPG, GIF, PNG or WebP, at most 1.5 MiB and 4,096 pixels on a side. Don't forget to add a title and a short description of the image.",
	imageRule:
		"The site team reserves the right to delete your image without notice. Any image that doesn't comply with the site's terms of use will be deleted. Any abuse will be sanctioned immediately.",
	titleField: 'Title',
	descriptionField: 'Description',
	descriptionHelp: 'Enter a short description of your image (BBCode allowed).',
	imageField: 'Your image',
	required: '(required)',
	upload: 'Upload',
	uploadError: (error: GalleryUploadError) => UPLOAD_ERRORS[error],
	errorsTitle: 'Upload errors',
	errorsInfo: 'The following errors must be fixed:',
	added: 'Your image was uploaded successfully.',
	guestsCannotAdd: 'Only site members can add images to the gallery.',

	// Deletion
	deleteImage: 'Delete image',
	deleteImageNamed: (title: string) => `Delete the image “${title}”`,
	confirmDelete: (title: string) => `Permanently delete the image “${title}” from the gallery?`,
	deleted: 'The image was deleted successfully.',

	// Insertion into a post (gallery.php?info=pick)
	pickerTitle: 'Insert an image from the gallery',
	pickerInfo:
		'Pick one of your images, or upload a new one (it joins the gallery): “Insert” adds its title, the image and its description to the post.',
	insert: 'Insert',
	insertNamed: (title: string) => `Insert “${title}” into the post`,
	insertCode: (title: string) => `BBCode for “${title}”`,
	inserted: 'Inserted into the post.',
	closeWindow: 'Close this window',
	noOwnImages: "You haven't uploaded any images yet.",
	noMatchingImages: 'No images match this search.',
	pickerSearch: 'Search for an image',
	searchLabel: 'Title or description',
	scopeLabel: 'In',
	scopeMine: 'My images',
	scopeAll: 'Whole gallery',
	searchButton: 'Search',
	pickLabel: (title: string) => `Choose “${title}”`,
	by: (author: string) => `by ${author}`,
};
