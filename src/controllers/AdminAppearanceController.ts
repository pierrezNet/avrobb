/**
 * Apparence du forum (admin_appearance.php, page propre à AvroBB, administrateurs) : remplacement du
 * logo et de la bannière de l'en-tête, et retour à l'image précédente.
 *
 * Le type et les dimensions sont lus dans le contenu ; l'image est gardée telle qu'envoyée (pas de
 * bibliothèque d'images dans le Worker), une image trop grande est refusée.
 */

import type { AppReply, AppRequest } from '../http/context.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage } from '../http/layout.ts';
import type { ConfigCache } from '../repositories/ConfigLoader.ts';
import type { ConfigStore } from '../repositories/ConfigRepository.ts';
import type { HeaderImageStore } from '../repositories/HeaderImageFiles.ts';
import { HEADER_IMAGES, type HeaderImageKind, headerImageHref, isHeaderImageKind } from '../services/headerImages.ts';
import { headerImageResize, resizeView } from '../services/imageResize.ts';
import { IMAGE_CONTENT_TYPES, readImageInfo } from '../services/images.ts';
import { adminDenied, renderAdminPage } from './adminPage.ts';

export interface AdminAppearanceControllerDeps extends LayoutDeps {
	headerImages: HeaderImageStore;
	configStore: ConfigStore;
	configCache: ConfigCache;
}

export interface AdminAppearanceQuery {
	done?: string;
}

const KINDS: readonly HeaderImageKind[] = ['logo', 'banner'];

export class AdminAppearanceController {
	constructor(private readonly deps: AdminAppearanceControllerDeps) {}

	show = async (request: AppRequest<{ Querystring: AdminAppearanceQuery }>, reply: AppReply): Promise<AppReply> => {
		const denied = adminDenied(request, reply, this.deps, true);
		if (denied !== null) return denied;
		const t = this.deps.page.lang.adminAppearance;
		const notices: Record<string, string> = { replaced: t.replaced, restored: t.restored };
		return this.#render(request, reply, notices[request.query.done ?? ''] ?? null, []);
	};

	submit = async (request: AppRequest<{ Body: FormBody }>, reply: AppReply): Promise<AppReply> => {
		const denied = adminDenied(request, reply, this.deps, true);
		if (denied !== null) return denied;
		const { lang } = this.deps.page;
		const kind = field(request.body, 'kind');
		if (!isHeaderImageKind(kind)) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);

		if (field(request.body, 'action') === 'restore') {
			if (!(await this.deps.headerImages.restore(kind))) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
			return this.#changed(reply, 'restored');
		}

		const upload = request.uploads.get('image')?.data;
		if (upload === undefined || upload.length === 0) return this.#render(request, reply, null, [lang.adminAppearance.noFile], 400);
		const image = readImageInfo(upload);
		if (image === null) return this.#render(request, reply, null, [lang.adminAppearance.badType], 400);
		const spec = HEADER_IMAGES[kind];
		if (image.width > spec.maxWidth || image.height > spec.maxHeight)
			return this.#render(request, reply, null, [lang.adminAppearance.tooLarge(spec.maxWidth, spec.maxHeight)], 400);
		await this.deps.headerImages.replace(kind, upload, IMAGE_CONTENT_TYPES[image.type]);
		return this.#changed(reply, 'replaced');
	};

	/** Nouvelle version des images (adresses changées, caches des navigateurs contournés). */
	async #changed(reply: AppReply, done: string): Promise<AppReply> {
		await this.deps.configStore.replaceValues(new Map([['o_header_version', String(this.deps.page.clock())]]));
		await this.deps.configCache.invalidate();
		return reply.redirect(`admin_appearance.php?done=${done}`, 303);
	}

	async #render(request: AppRequest, reply: AppReply, notice: string | null, errors: string[], status = 200): Promise<AppReply> {
		const t = this.deps.page.lang.adminAppearance;
		const version = request.board.headerVersion;
		const images = await Promise.all(
			KINDS.map(async (kind) => ({
				kind,
				title: t.kinds[kind].title,
				help: t.kinds[kind].help,
				href: headerImageHref(kind, version),
				canRestore: await this.deps.headerImages.hasPrevious(kind),
				resize: resizeView(headerImageResize(kind)),
			})),
		);
		reply.code(status);
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'appearance', template: 'admin_appearance.njk', title: t.title },
			{ notice, errors, images, formAction: 'admin_appearance.php' },
		);
	}
}
