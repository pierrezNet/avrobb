/**
 * Gestionnaire de fichiers (gestionnaire.php, plugin Uploadile de PV) : la fenêtre ouverte depuis
 * les formulaires de rédaction pour envoyer un fichier dans son dossier img/members/<id>/ et
 * l'insérer dans le message (JavaScript progressif : sans lui, l'adresse reste à copier).
 *
 * Écarts assumés : page dans la mise en page commune (le PHP en construisait une réduite) ; une
 * image est insérée en [img], un autre fichier en lien (le PHP insérait un lien « Votre texte
 * ici » pour toute image sans miniature).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ImageProcessor } from '../adapters/imageProcessor.ts';
import type { FormBody } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildFileManager } from '../presenters/profilePlugilePage.ts';
import type { UploadStore } from '../repositories/MemberUploadFiles.ts';
import type { ProfileStore } from '../repositories/ProfileRepository.ts';
import { uploadLimits } from '../services/uploads.ts';
import { UploadActions, type UploadOwner } from './uploadActions.ts';

export interface FileManagerControllerDeps extends LayoutDeps {
	imageProcessor: ImageProcessor;
	uploads: UploadStore;
	profileStore: ProfileStore;
}

export interface FileManagerQuery {
	done?: string;
}

type FileManagerRequest = FastifyRequest<{ Querystring: FileManagerQuery; Body?: FormBody }>;

export class FileManagerController {
	readonly #actions: UploadActions;

	constructor(private readonly deps: FileManagerControllerDeps) {
		this.#actions = new UploadActions(deps);
	}

	show = async (request: FileManagerRequest, reply: FastifyReply): Promise<FastifyReply> => {
		const owner = await this.owner(request);
		if (owner === null) return renderMessage(request, reply, this.deps, 403, this.deps.page.lang.common.noView);
		return this.render(request, reply, owner, []);
	};

	submit = async (request: FileManagerRequest, reply: FastifyReply): Promise<FastifyReply> => {
		const owner = await this.owner(request);
		if (owner === null) return renderMessage(request, reply, this.deps, 403, this.deps.page.lang.common.noView);
		const outcome = await this.#actions.handle(request, owner);
		if ('error' in outcome) return this.render(request, reply, owner, [outcome.error]);
		return reply.redirect(`gestionnaire.php?done=${outcome.notice}`, 303);
	};

	/** Le lecteur, s'il est membre et peut lire le forum, avec l'espace qu'il occupe. */
	private async owner(request: FastifyRequest): Promise<UploadOwner | null> {
		const { viewer } = request;
		if (viewer.isGuest || !viewer.group.canReadBoard) return null;
		const profile = await this.deps.profileStore.findEditableProfile(viewer.id);
		return profile !== null ? { id: viewer.id, groupId: profile.groupId, uploadedBytes: profile.uploadedBytes } : null;
	}

	private async render(request: FileManagerRequest, reply: FastifyReply, owner: UploadOwner, errors: string[]): Promise<FastifyReply> {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		const notices: Record<string, string> = {
			uploaded: lang.profile.uploadSuccess,
			deleted: lang.profile.deleteSuccess,
			deleteFailed: lang.profile.deleteFailed,
		};
		const stored = await this.deps.uploads.list(owner.id);
		const view = buildFileManager({
			viewer,
			config,
			lang,
			files: stored?.map((file) => ({ ...file, href: this.deps.uploads.urlFor(owner.id, file.name) })) ?? null,
			limits: uploadLimits(owner.groupId, config.uploads),
			usedBytes: owner.uploadedBytes,
			errors,
			notice: notices[request.query.done ?? ''] ?? null,
		});
		return renderPage(
			request,
			reply,
			this.deps,
			'gestionnaire.njk',
			{ pageId: 'gestionnaire', titleParts: [config.boardTitle, lang.profile.fileManager], allowIndex: false },
			view,
		);
	}
}
