/**
 * Contrôleur de gallery.php : consultation (toutes les images ou « Mes images », ?mine=1), envoi
 * d'une image (?info=new), suppression (?info=modo&option=del&id=…) et sélecteur d'images à
 * insérer dans un message (?info=pick, ouvert depuis les formulaires de rédaction).
 *
 * Écarts assumés : suppression en POST après confirmation (le PHP supprimait sur un lien GET) ;
 * l'auteur et les administrateurs peuvent aussi supprimer (le PHP ne le permettait qu'au groupe des
 * modérateurs) ; les erreurs réaffichent le formulaire.
 */

import type { AppReply, AppRequest } from '../http/context.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildGalleryPage, buildGalleryPicker, galleryUrl } from '../presenters/galleryPage.ts';
import type { CensorReader } from '../repositories/CensorRepository.ts';
import type { GalleryFileStore } from '../repositories/GalleryFiles.ts';
import type { GalleryStore } from '../repositories/GalleryRepository.ts';
import { buildCensor } from '../services/censor.ts';
import { canDeleteGalleryImage, validateGalleryUpload } from '../services/gallery.ts';
import { clampPage, pageCount } from '../services/pagination.ts';
import { punTrim } from '../services/phpString.ts';
import { positiveInt } from './params.ts';

export interface GalleryControllerDeps extends LayoutDeps {
	gallery: GalleryStore;
	galleryFiles: GalleryFileStore;
	censorship: CensorReader;
}

export interface GalleryQuery {
	info?: string;
	option?: string;
	id?: string;
	p?: string;
	mine?: string;
	from?: string;
	done?: string;
	/** Sélecteur : recherche (titre, description), portée (`all` : toute la galerie) et affichage en popin. */
	q?: string;
	scope?: string;
	embed?: string;
}

type GalleryRequest = AppRequest<{ Querystring: GalleryQuery; Body?: FormBody }>;

/** 5 lignes de 4 images, comme gallery.php. */
const PER_PAGE = 20;
/** Images proposées par le sélecteur : les plus récentes (du membre par défaut). */
const PICKER_LIMIT = 60;
/** Longueur maximale du texte cherché (galerie et sélecteur). */
const SEARCH_MAX = 80;

/** Texte cherché dans le titre et la description, nettoyé et borné. */
const searchText = (q: string | undefined): string => [...punTrim(q ?? '')].slice(0, SEARCH_MAX).join('');

interface FormState {
	title: string;
	description: string;
	errors: string[];
}

const EMPTY_FORM: FormState = { title: '', description: '', errors: [] };

export class GalleryController {
	constructor(private readonly deps: GalleryControllerDeps) {}

	show = async (request: GalleryRequest, reply: AppReply): Promise<AppReply> => {
		const { viewer } = request;
		const { lang } = this.deps.page;
		const { query } = request;
		if (!viewer.group.canReadBoard) return renderMessage(request, reply, this.deps, 403, lang.common.noView);

		if (query.option === 'del') return this.confirmDelete(request, reply);
		if (query.info === 'new' || query.info === 'pick') {
			if (viewer.isGuest) return renderMessage(request, reply, this.deps, 403, lang.gallery.guestsCannotAdd);
			return query.info === 'new' ? this.renderForm(request, reply, EMPTY_FORM) : this.renderPicker(request, reply, EMPTY_FORM);
		}
		return this.list(request, reply);
	};

	submit = async (request: AppRequest<{ Querystring: GalleryQuery; Body: FormBody }>, reply: AppReply): Promise<AppReply> => {
		const { viewer } = request;
		const { lang } = this.deps.page;
		if (!viewer.group.canReadBoard) return renderMessage(request, reply, this.deps, 403, lang.common.noView);
		if (request.query.option === 'del') return this.delete(request, reply);
		if (request.query.info !== 'new') return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
		if (viewer.isGuest) return renderMessage(request, reply, this.deps, 403, lang.gallery.guestsCannotAdd);
		return this.upload(request, reply);
	};

	private async list(request: GalleryRequest, reply: AppReply): Promise<AppReply> {
		const { viewer, board: config, query } = request;
		const { lang } = this.deps.page;
		const mine = query.mine !== undefined && !viewer.isGuest;
		const owner = mine ? viewer.id : null;
		const search = searchText(query.q);

		const numPages = pageCount(await this.deps.gallery.countImages(owner, search), PER_PAGE);
		const page = clampPage(query.p, numPages);
		const [images, censoredWords] = await Promise.all([
			this.deps.gallery.listImages((page - 1) * PER_PAGE, PER_PAGE, owner, search),
			config.censoring ? this.deps.censorship.listWords() : [],
		]);
		const notices: Record<string, string> = { added: lang.gallery.added, deleted: lang.gallery.deleted };

		const view = buildGalleryPage({
			viewer,
			config,
			images,
			page,
			numPages,
			mine,
			search,
			censor: config.censoring ? buildCensor(censoredWords) : null,
			lang,
			dateWords: this.deps.page.dateWords,
			now: this.deps.page.clock(),
			notice: notices[query.done ?? ''] ?? null,
		});
		return renderPage(
			request,
			reply,
			this.deps,
			'gallery.njk',
			{
				pageId: 'gallery',
				titleParts: [config.boardTitle, view.heading],
				pageNumber: page > 1 ? page : null,
				activeNav: 'gallery',
				allowIndex: !mine && search === '',
				canonicalUrl: mine || search !== '' ? null : galleryUrl(page),
			},
			view,
		);
	}

	private async upload(request: AppRequest<{ Querystring: GalleryQuery; Body: FormBody }>, reply: AppReply): Promise<AppReply> {
		const { viewer, body } = request;
		const { lang } = this.deps.page;
		const fromPicker = request.query.from === 'pick';
		const result = validateGalleryUpload({
			title: field(body, 'titre'),
			description: field(body, 'description'),
			image: request.uploads.get('req_file')?.data ?? null,
		});
		const source = request.uploads.get('req_file')?.data;
		if (result.errors.length > 0 || result.image === null || source === undefined) {
			const form = {
				title: field(body, 'titre'),
				description: field(body, 'description'),
				errors: result.errors.map((e) => lang.gallery.uploadError(e)),
			};
			return fromPicker ? this.renderPicker(request, reply, form) : this.renderForm(request, reply, form);
		}

		// Image gardée telle qu'envoyée (pas de bibliothèque d'images dans le Worker) : elle sert
		// aussi de vignette et, en WebP, de variante mobile, en attendant la réduction par le
		// navigateur (lot 6 de TODO.md). Fichier écrit avant la ligne : un échec laisse au pire un
		// fichier orphelin, effacé par la tâche planifiée.
		const { type } = result.image;
		const addedAt = await this.deps.galleryFiles.save(this.deps.page.clock(), type, {
			image: source,
			thumbnail: source,
			mobile: type === 'webp' ? source : null,
		});
		await this.deps.gallery.createImage({
			title: result.title,
			description: result.description,
			userId: viewer.id,
			addedAt,
			extension: `.${type}`,
		});
		if (!fromPicker) return reply.redirect('gallery.php?done=added', 303);
		return reply.redirect(`gallery.php?info=pick&done=added${request.query.embed === '1' ? '&embed=1' : ''}`, 303);
	}

	/** Image désignée par ?id=, si le lecteur peut la supprimer ; sinon la réponse d'erreur. */
	private async deletable(request: GalleryRequest, reply: AppReply) {
		const { lang } = this.deps.page;
		const image = await this.deps.gallery.findImage(positiveInt(request.query.id));
		if (image === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
		if (!canDeleteGalleryImage(request.viewer, image)) return renderMessage(request, reply, this.deps, 403, lang.common.noPermission);
		return image;
	}

	private async confirmDelete(request: GalleryRequest, reply: AppReply): Promise<AppReply> {
		const image = await this.deletable(request, reply);
		if (!('extension' in image)) return image;
		const { lang } = this.deps.page;
		return renderPage(
			request,
			reply,
			this.deps,
			'confirm.njk',
			{ pageId: 'gallery', titleParts: [request.board.boardTitle, lang.gallery.pageTitle, lang.gallery.deleteImage], activeNav: 'gallery' },
			{
				title: lang.gallery.deleteImage,
				text: lang.gallery.confirmDelete(image.title),
				action: `gallery.php?info=modo&option=del&id=${image.id}`,
				button: lang.gallery.deleteImage,
			},
		);
	}

	private async delete(request: GalleryRequest, reply: AppReply): Promise<AppReply> {
		const image = await this.deletable(request, reply);
		if (!('extension' in image)) return image;
		// La ligne d'abord : un fichier orphelin vaut mieux qu'une image qui pointe dans le vide.
		await this.deps.gallery.deleteImage(image.id);
		await this.deps.galleryFiles.delete(image.addedAt, image.extension);
		return reply.redirect('gallery.php?done=deleted', 303);
	}

	private renderForm(request: GalleryRequest, reply: AppReply, form: FormState): Promise<AppReply> {
		const { lang } = this.deps.page;
		return renderPage(
			request,
			reply,
			this.deps,
			'gallery_new.njk',
			{ pageId: 'gallery', titleParts: [request.board.boardTitle, lang.gallery.pageTitle, lang.gallery.postTitle], activeNav: 'gallery' },
			{ formAction: 'gallery.php?info=new', ...form },
		);
	}

	private async renderPicker(request: GalleryRequest, reply: AppReply, form: FormState): Promise<AppReply> {
		const { viewer, board: config, query } = request;
		const { lang } = this.deps.page;
		const search = searchText(query.q);
		const allImages = query.scope === 'all';
		const added = query.done === 'added';
		const view = buildGalleryPicker({
			config,
			images: await this.deps.gallery.listImages(0, PICKER_LIMIT, allImages ? null : viewer.id, search),
			form,
			lang,
			notice: added ? lang.gallery.added : null,
			search,
			allImages,
			embedded: query.embed === '1',
			preselectFirst: added,
		});
		return renderPage(
			request,
			reply,
			this.deps,
			'gallery_pick.njk',
			{ pageId: 'gallery', titleParts: [config.boardTitle, lang.gallery.pickerTitle], allowIndex: false },
			view,
		);
	}
}
