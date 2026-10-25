/**
 * Modèles de vue de la galerie (gallery.php) : liste des images (toutes ou « Mes images »),
 * formulaire d'envoi, et sélecteur d'images à insérer dans un message. Fonctions pures.
 */

import { type BoardConfig, type GalleryImage, GroupId, type Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { parseMessage } from '../services/bbcode.ts';
import type { Censor } from '../services/censor.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import { canDeleteGalleryImage, galleryFiles, galleryInsertCode } from '../services/gallery.ts';
import { type PaginationLink, paginationLinks } from './navigation.ts';
import { messageParserOptions } from './parserOptions.ts';

export interface GalleryImageView {
	id: number;
	title: string;
	thumbUrl: string;
	fullUrl: string;
	addedAt: string;
	author: string;
	/** HTML de parseMessage() (échappé par construction). */
	descriptionHtml: string;
	/** Lien vers la confirmation de suppression, si le lecteur peut supprimer l'image. */
	deleteUrl: string | null;
}

export interface GalleryPageView {
	heading: string;
	intro: string;
	images: GalleryImageView[];
	pagination: PaginationLink[];
	/** Envoi d'une image : membres seulement. */
	addUrl: string | null;
	/** Filtre « Toutes les images » / « Mes images » (membres). */
	filters: { href: string; label: string; active: boolean }[];
	/** Modération : groupe Modérateurs, comme gallery.php (les administrateurs suppriment depuis la liste). */
	moderationUrl: string | null;
	notice: string | null;
}

export interface GalleryPageInput {
	viewer: Viewer;
	config: BoardConfig;
	images: readonly GalleryImage[];
	page: number;
	numPages: number;
	/** Seulement les images du lecteur (?mine=1). */
	mine: boolean;
	censor: Censor | null;
	lang: Lang;
	dateWords: DateWords;
	now: number;
	notice: string | null;
}

export function galleryUrl(page: number, mine = false): string {
	const params = [...(mine ? ['mine=1'] : []), ...(page > 1 ? [`p=${page}`] : [])];
	return params.length > 0 ? `gallery.php?${params.join('&')}` : 'gallery.php';
}

function imageView(
	image: GalleryImage,
	input: Omit<GalleryPageInput, 'images' | 'page' | 'numPages' | 'mine' | 'notice'>,
): GalleryImageView {
	const { viewer, config, lang } = input;
	const files = galleryFiles(image);
	return {
		id: image.id,
		title: image.title,
		thumbUrl: files.thumb,
		fullUrl: files.full,
		addedAt: formatTime(image.addedAt, viewerTimeSettings(viewer), input.dateWords, input.now),
		author: image.username,
		// $hide_smilies = 0 dans gallery.php : émoticônes selon le forum et le lecteur.
		descriptionHtml: parseMessage(image.description, messageParserOptions(config, viewer, lang, input.censor)),
		deleteUrl: canDeleteGalleryImage(viewer, image) ? `gallery.php?info=modo&option=del&id=${image.id}` : null,
	};
}

export function buildGalleryPage(input: GalleryPageInput): GalleryPageView {
	const { viewer, lang } = input;
	const t = lang.gallery;
	return {
		heading: input.mine ? t.myImages : t.pageTitle,
		intro: input.mine ? t.myImagesDesc : t.pageDesc,
		images: input.images.map((image) => imageView(image, input)),
		pagination: paginationLinks(input.numPages, input.page, (page) => galleryUrl(page, input.mine)),
		addUrl: viewer.isGuest ? null : 'gallery.php?info=new',
		filters: viewer.isGuest
			? []
			: [
					{ href: galleryUrl(1), label: t.allImages, active: !input.mine },
					{ href: galleryUrl(1, true), label: t.myImages, active: input.mine },
				],
		moderationUrl: viewer.group.id === GroupId.Moderator ? 'gallery.php?info=modo' : null,
		notice: input.notice,
	};
}

// ——— Envoi ———

export interface GalleryFormView {
	formAction: string;
	title: string;
	description: string;
	errors: string[];
}

// ——— Sélecteur d'images pour un message ———

export interface PickerImageView {
	id: number;
	title: string;
	thumbUrl: string;
	fullUrl: string;
	insertCode: string;
	insertLabel: string;
	codeLabel: string;
}

export interface GalleryPickerView {
	images: PickerImageView[];
	form: GalleryFormView;
	notice: string | null;
}

export function buildGalleryPicker(input: {
	config: BoardConfig;
	images: readonly GalleryImage[];
	form: { title: string; description: string; errors: string[] };
	lang: Lang;
	notice: string | null;
}): GalleryPickerView {
	const t = input.lang.gallery;
	return {
		images: input.images.map((image) => {
			const files = galleryFiles(image);
			return {
				id: image.id,
				title: image.title,
				thumbUrl: files.thumb,
				fullUrl: files.full,
				insertCode: galleryInsertCode(image, input.config.baseUrl),
				insertLabel: t.insertNamed(image.title),
				codeLabel: t.insertCode(image.title),
			};
		}),
		form: { formAction: 'gallery.php?info=new&from=pick', ...input.form },
		notice: input.notice,
	};
}
