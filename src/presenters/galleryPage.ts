/**
 * Modèle de vue de la galerie (gallery.php, consultation). Fonction pure.
 */

import { type BoardConfig, type GalleryImage, GroupId, type Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { parseMessage } from '../services/bbcode.ts';
import type { Censor } from '../services/censor.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import { type PaginationLink, paginationLinks } from './navigation.ts';

/** Dossier des images, dans l'installation PHP ($rep_upload). */
const UPLOAD_DIR = 'img/gallery/';

export interface GalleryImageView {
	id: number;
	title: string;
	thumbUrl: string;
	fullUrl: string;
	addedAt: string;
	author: string;
	/** HTML de parseMessage() (échappé par construction). */
	descriptionHtml: string;
}

export interface GalleryPageView {
	images: GalleryImageView[];
	pagination: PaginationLink[];
	/** Envoi d'une image : membres seulement, servi par le PHP. */
	addUrl: string | null;
	/** Modération : groupe Modérateurs seulement, comme gallery.php (pas les administrateurs). */
	moderationUrl: string | null;
}

export interface GalleryPageInput {
	viewer: Viewer;
	config: BoardConfig;
	images: readonly GalleryImage[];
	page: number;
	numPages: number;
	censor: Censor | null;
	lang: Lang;
	dateWords: DateWords;
	now: number;
}

export function galleryUrl(page: number): string {
	return page > 1 ? `gallery.php?p=${page}` : 'gallery.php';
}

export function buildGalleryPage(input: GalleryPageInput): GalleryPageView {
	const { viewer, config, lang } = input;
	const time = viewerTimeSettings(viewer);

	return {
		images: input.images.map((image) => ({
			id: image.id,
			title: image.title,
			thumbUrl: `${UPLOAD_DIR}mini_${image.addedAt}${image.extension}`,
			fullUrl: `${UPLOAD_DIR}${image.addedAt}${image.extension}`,
			addedAt: formatTime(image.addedAt, time, input.dateWords, input.now),
			author: image.username,
			// $hide_smilies = 0 dans gallery.php : émoticônes selon le forum et le lecteur.
			descriptionHtml: parseMessage(image.description, {
				bbcode: config.bbcode,
				imgTag: config.imgTag,
				showImages: viewer.showImages,
				smilies: config.smilies && viewer.showSmilies,
				censor: input.censor,
				baseUrl: config.baseUrl,
				indentSpaces: config.indentSpaces,
				labels: { wrote: lang.common.wrote, imageLink: lang.common.imageLink, spoiler: lang.common.spoiler, video: lang.common.video },
			}),
		})),
		pagination: paginationLinks(input.numPages, input.page, galleryUrl),
		addUrl: viewer.isGuest ? null : 'gallery.php?info=new',
		moderationUrl: viewer.group.id === GroupId.Moderator ? 'gallery.php?info=modo' : null,
	};
}
