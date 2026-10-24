/**
 * Contrôleur de gallery.php, pour la consultation. L'envoi (?info=new) et la modération
 * (?info=modo) écrivent des fichiers et en base : ils restent servis par le PHP (lot 5).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildGalleryPage, galleryUrl } from '../presenters/galleryPage.ts';
import type { CensorReader } from '../repositories/CensorRepository.ts';
import type { GalleryReader } from '../repositories/GalleryRepository.ts';
import { buildCensor } from '../services/censor.ts';
import { clampPage, pageCount } from '../services/pagination.ts';

export interface GalleryControllerDeps extends LayoutDeps {
	gallery: GalleryReader;
	censorship: CensorReader;
	legacyBaseUrl: string;
}

export interface GalleryQuery {
	info?: string;
	option?: string;
	p?: string;
}

/** 5 lignes de 4 images, comme gallery.php. */
const PER_PAGE = 20;

export class GalleryController {
	constructor(private readonly deps: GalleryControllerDeps) {}

	show = async (request: FastifyRequest<{ Querystring: GalleryQuery }>, reply: FastifyReply): Promise<FastifyReply> => {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		const { query } = request;

		if (!viewer.group.canReadBoard) return renderMessage(request, reply, this.deps, 403, lang.common.noView);

		const consulting = (query.info === undefined || query.info === 'none') && (query.option === undefined || query.option === 'none');
		if (!consulting && this.deps.legacyBaseUrl !== '') {
			const search = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
			return reply.redirect(`${this.deps.legacyBaseUrl}/gallery.php${search}`);
		}

		const numPages = pageCount(await this.deps.gallery.countImages(), PER_PAGE);
		const page = clampPage(query.p, numPages);
		const [images, censoredWords] = await Promise.all([
			this.deps.gallery.listImages((page - 1) * PER_PAGE, PER_PAGE),
			config.censoring ? this.deps.censorship.listWords() : [],
		]);

		const view = buildGalleryPage({
			viewer,
			config,
			images,
			page,
			numPages,
			censor: config.censoring ? buildCensor(censoredWords) : null,
			lang,
			dateWords: this.deps.page.dateWords,
			now: this.deps.page.clock(),
		});

		return renderPage(
			request,
			reply,
			this.deps,
			'gallery.njk',
			{ pageId: 'gallery', titleParts: [config.boardTitle, lang.gallery.pageTitle], allowIndex: true, canonicalUrl: galleryUrl(page) },
			view,
		);
	};
}
