/**
 * Avatar du profil (profile.php?action=upload_avatar, upload_avatar2, delete_avatar) : envoi
 * contrôlé (type réel, poids, dimensions) et effacement.
 *
 * Écarts assumés : l'effacement demande une confirmation en POST (le PHP effaçait sur un simple
 * lien GET) ; les droits sont ceux de la modification du profil (le PHP laissait tout modérateur
 * changer l'avatar de n'importe qui, administrateurs compris) ; le type est lu dans le contenu,
 * jamais dans l'en-tête envoyé par le navigateur.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ImageProcessor } from '../adapters/imageProcessor.ts';
import type { FormBody } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildProfileMenu } from '../presenters/profileEditPage.ts';
import type { AvatarStore } from '../services/avatars.ts';
import { checkAvatar, readImageInfo } from '../services/images.ts';
import { fileSize, forumNumberFormat } from '../services/numberFormat.ts';
import { isProfile, loadEditableProfile, type ProfileAccessDeps, type ProfileQuery } from './profileAccess.ts';

export interface AvatarControllerDeps extends LayoutDeps, ProfileAccessDeps {
	imageProcessor: ImageProcessor;
	avatarStore: AvatarStore;
}

type AvatarRequest = FastifyRequest<{ Querystring: ProfileQuery; Body?: FormBody }>;

export class AvatarController {
	constructor(private readonly deps: AvatarControllerDeps) {}

	uploadForm = async (request: AvatarRequest, reply: FastifyReply): Promise<FastifyReply> =>
		this.withProfile(request, reply, (id, username) => this.renderUpload(request, reply, id, username, []));

	upload = async (request: AvatarRequest, reply: FastifyReply): Promise<FastifyReply> =>
		this.withProfile(request, reply, async (id, username) => {
			const config = request.board;
			const limits = { maxBytes: config.avatarMaxBytes, maxWidth: config.avatarMaxWidth, maxHeight: config.avatarMaxHeight };
			const data = await this.#fitAvatar(request.uploads.get('req_file')?.data ?? Buffer.alloc(0), limits);
			const checked = checkAvatar(data, limits);
			if ('error' in checked)
				return this.renderUpload(request, reply, id, username, [this.deps.page.lang.profile.avatarError(checked.error, forumNumberFormat)]);

			await this.deps.avatarStore.save(id, config.avatarsDir, checked.image.type, data);
			return reply.redirect(`profile.php?section=personality&id=${id}&updated=1`, 303);
		});

	/**
	 * Image trop grande ou trop lourde : réduite automatiquement aux dimensions permises (le PHP la
	 * refusait). Les autres cas (petite image, contenu qui n'est pas une image) passent tels quels aux contrôles.
	 */
	async #fitAvatar(data: Buffer, limits: { maxBytes: number; maxWidth: number; maxHeight: number }): Promise<Buffer> {
		const info = readImageInfo(data);
		if (info === null) return data;
		if (info.width <= limits.maxWidth && info.height <= limits.maxHeight && data.length <= limits.maxBytes) return data;
		const fitted = await this.deps.imageProcessor.avatar(data, info.type, {
			width: limits.maxWidth,
			height: limits.maxHeight,
			maxBytes: limits.maxBytes,
		});
		return fitted?.data ?? data;
	}

	deleteForm = async (request: AvatarRequest, reply: FastifyReply): Promise<FastifyReply> =>
		this.withProfile(request, reply, (id) => {
			const { lang } = this.deps.page;
			return renderPage(
				request,
				reply,
				this.deps,
				'confirm.njk',
				{ pageId: 'profile', titleParts: [request.board.boardTitle, lang.common.profile, lang.profile.deleteAvatar], activeNav: 'profile' },
				{
					title: lang.profile.confirmDeleteAvatar,
					text: lang.profile.confirmDeleteAvatarInfo,
					action: `profile.php?action=delete_avatar&id=${id}`,
					button: lang.profile.deleteAvatar,
				},
			);
		});

	delete = async (request: AvatarRequest, reply: FastifyReply): Promise<FastifyReply> =>
		this.withProfile(request, reply, async (id) => {
			await this.deps.avatarStore.delete(id, request.board.avatarsDir);
			return reply.redirect(`profile.php?section=personality&id=${id}&updated=1`, 303);
		});

	/** Avatars activés et profil modifiable par le lecteur. */
	private async withProfile(
		request: AvatarRequest,
		reply: FastifyReply,
		body: (userId: number, username: string) => Promise<FastifyReply>,
	): Promise<FastifyReply> {
		if (!request.board.avatars) return renderMessage(request, reply, this.deps, 404, this.deps.page.lang.profile.avatarsDisabled);
		const profile = await loadEditableProfile(request, reply, this.deps);
		if (!isProfile(profile)) return profile;
		return body(profile.id, profile.username);
	}

	private renderUpload(request: AvatarRequest, reply: FastifyReply, id: number, username: string, errors: string[]): Promise<FastifyReply> {
		const { board: config } = request;
		const { lang } = this.deps.page;
		return renderPage(
			request,
			reply,
			this.deps,
			'profile_avatar.njk',
			{ pageId: 'profile', titleParts: [config.boardTitle, lang.common.profile, lang.profile.uploadAvatar], activeNav: 'profile' },
			{
				menu: buildProfileMenu(config, id, 'personality', lang),
				heading: lang.profile.sectionHeading(username, lang.profile.uploadAvatar),
				formAction: `profile.php?action=upload_avatar2&id=${id}`,
				maxBytes: config.avatarMaxBytes,
				description: lang.profile.avatarDesc(
					config.avatarMaxWidth,
					config.avatarMaxHeight,
					forumNumberFormat(config.avatarMaxBytes),
					fileSize(config.avatarMaxBytes),
				),
				errors,
			},
		);
	}
}
