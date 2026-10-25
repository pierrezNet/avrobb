/**
 * Contrôleur de profile.php : aiguillage entre la consultation d'un profil (ici), sa modification
 * (sections, ProfileEditController), les actions mot de passe, adresse et avatar
 * (AccountController, AvatarController) et les plugiles de PV (PlugileController).
 *
 * Comme le PHP, un lecteur qui ne peut pas modifier le profil le consulte, quelle que soit la
 * section ou le plugile demandé. Seule la section « Administration » (groupe, modération,
 * bannissement, suppression du membre) reste servie par le PHP jusqu'au lot Administration.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FormBody } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildProfilePage } from '../presenters/profilePage.ts';
import type { ProfileReader } from '../repositories/UserRepository.ts';
import { buildCensor } from '../services/censor.ts';
import { canEditProfile } from '../services/permissions.ts';
import { isProfileSection } from '../services/profileForms.ts';
import { AccountController, type AccountControllerDeps } from './AccountController.ts';
import { AvatarController, type AvatarControllerDeps } from './AvatarController.ts';
import { PlugileController, type PlugileControllerDeps } from './PlugileController.ts';
import { ProfileEditController, type ProfileEditControllerDeps } from './ProfileEditController.ts';
import { positiveInt } from './params.ts';
import type { ProfileQuery } from './profileAccess.ts';

export type { ProfileQuery } from './profileAccess.ts';

export interface ProfileControllerDeps
	extends LayoutDeps,
		ProfileEditControllerDeps,
		AccountControllerDeps,
		AvatarControllerDeps,
		PlugileControllerDeps {
	profiles: ProfileReader;
	/** Installation PHP, qui garde la section « Administration ». */
	legacyBaseUrl: string;
}

type ProfileRequest = FastifyRequest<{ Querystring: ProfileQuery }>;
type ProfilePost = FastifyRequest<{ Querystring: ProfileQuery; Body: FormBody }>;

const AVATAR_UPLOAD = new Set(['upload_avatar', 'upload_avatar2']);

export class ProfileController {
	readonly #edit: ProfileEditController;
	readonly #account: AccountController;
	readonly #avatar: AvatarController;
	readonly #plugiles: PlugileController;

	constructor(private readonly deps: ProfileControllerDeps) {
		this.#edit = new ProfileEditController(deps);
		this.#account = new AccountController(deps);
		this.#avatar = new AvatarController(deps);
		this.#plugiles = new PlugileController(deps);
	}

	show = async (request: ProfileRequest, reply: FastifyReply): Promise<FastifyReply> => {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		const { query } = request;
		const id = positiveInt(query.id);

		if (query.action !== undefined) return this.showAction(request, reply);

		if (id < 2) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
		if (!viewer.group.canReadBoard) return renderMessage(request, reply, this.deps, 403, lang.common.noView);
		if (!viewer.group.canViewUsers && (viewer.isGuest || viewer.id !== id))
			return renderMessage(request, reply, this.deps, 403, lang.common.noPermission);

		const profile = await this.deps.profiles.findProfile(id);
		if (profile === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);

		if (canEditProfile(viewer, profile)) {
			if (query.plugin !== undefined) {
				if (query.plugin === 'UP_Ma_biographie.php') return this.#plugiles.biography(request, reply);
				if (query.plugin === 'UPP_Suivile.php') return this.#plugiles.subscriptions(request, reply);
				if (query.plugin === 'UPP_Mes_uploads.php') return this.#plugiles.uploads(request, reply);
				return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
			}
			if (query.section === 'admin') return this.toLegacy(request, reply);
			const section = query.section ?? 'essentials';
			if (!isProfileSection(section)) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
			return this.#edit.show(request, reply, section);
		}

		const [bannedUsernames, censoredWords, avatarUrl] = await Promise.all([
			this.deps.bans.listBannedUsernames(),
			config.censoring ? this.deps.censorship.listWords() : [],
			config.avatars ? this.deps.avatars.urlFor(profile.id, config.avatarsDir) : null,
		]);

		const view = buildProfilePage({
			viewer,
			config,
			profile,
			avatarUrl,
			bannedUsernames,
			censor: config.censoring ? buildCensor(censoredWords) : null,
			lang,
			dateWords: this.deps.page.dateWords,
			now: this.deps.page.clock(),
		});

		return renderPage(
			request,
			reply,
			this.deps,
			'profile.njk',
			{
				pageId: 'profile',
				titleParts: [config.boardTitle, lang.profile.usersProfile(profile.username)],
				activeNav: 'index',
				allowIndex: true,
				canonicalUrl: `profile.php?id=${profile.id}`,
			},
			view,
		);
	};

	/** Formulaires POST : actions, plugiles, puis sections. */
	submit = async (request: ProfilePost, reply: FastifyReply): Promise<FastifyReply> => {
		const { query } = request;
		const { lang } = this.deps.page;
		switch (query.action) {
			case undefined:
				break;
			case 'change_pass':
				return this.#account.changePassword(request, reply);
			case 'change_email':
				return this.#account.changeEmail(request, reply);
			case 'delete_avatar':
				return this.#avatar.delete(request, reply);
			default:
				if (AVATAR_UPLOAD.has(query.action)) return this.#avatar.upload(request, reply);
				return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
		}
		if (query.plugin === 'UP_Ma_biographie.php') return this.#plugiles.saveBiography(request, reply);
		if (query.plugin === 'UPP_Suivile.php') return this.#plugiles.unsubscribe(request, reply);
		if (query.plugin === 'UPP_Mes_uploads.php') return this.#plugiles.updateUploads(request, reply);
		if (query.plugin === undefined && isProfileSection(query.section)) return this.#edit.submit(request, reply, query.section);
		return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
	};

	private showAction(request: ProfileRequest, reply: FastifyReply): Promise<FastifyReply> {
		const action = request.query.action ?? '';
		if (action === 'change_pass') return this.#account.passwordForm(request, reply);
		if (action === 'change_email') return this.#account.emailForm(request, reply);
		if (AVATAR_UPLOAD.has(action)) return this.#avatar.uploadForm(request, reply);
		if (action === 'delete_avatar') return this.#avatar.deleteForm(request, reply);
		return renderMessage(request, reply, this.deps, 404, this.deps.page.lang.common.badRequest);
	}

	/** Section « Administration » : même adresse sur l'installation PHP, si elle est configurée. */
	private async toLegacy(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
		// Sans installation PHP (LEGACY_BASE_URL vide), rediriger bouclerait sur Node.
		if (this.deps.legacyBaseUrl === '') return renderMessage(request, reply, this.deps, 404, this.deps.page.lang.common.badRequest);
		const search = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
		return reply.redirect(`${this.deps.legacyBaseUrl}/profile.php${search}`);
	}
}
