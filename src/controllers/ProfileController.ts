/**
 * Contrôleur de profile.php : aiguillage entre la consultation d'un profil (ici), sa modification
 * (sections, ProfileEditController) et l'avatar (AvatarController).
 *
 * Comme le PHP, un lecteur qui ne peut pas modifier le profil le consulte, quelle que soit la
 * section demandée. La section « Administration » de FluxBB n'existe pas : admin_users.php la
 * remplace (groupe, bannissement, suppression).
 */

import type { AppReply, AppRequest } from '../http/context.ts';
import type { FormBody } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildProfilePage } from '../presenters/profilePage.ts';
import type { ProfileReader } from '../repositories/UserRepository.ts';
import { buildCensor } from '../services/censor.ts';
import { canEditProfile } from '../services/permissions.ts';
import { isProfileSection } from '../services/profileForms.ts';
import { AccountDeleteController, type AccountDeleteControllerDeps } from './AccountDeleteController.ts';
import { AvatarController, type AvatarControllerDeps } from './AvatarController.ts';
import { ProfileEditController, type ProfileEditControllerDeps } from './ProfileEditController.ts';
import { positiveInt } from './params.ts';
import type { ProfileQuery } from './profileAccess.ts';

export type { ProfileQuery } from './profileAccess.ts';

export interface ProfileControllerDeps extends LayoutDeps, ProfileEditControllerDeps, AvatarControllerDeps, AccountDeleteControllerDeps {
	profiles: ProfileReader;
}

type ProfileRequest = AppRequest<{ Querystring: ProfileQuery }>;
type ProfilePost = AppRequest<{ Querystring: ProfileQuery; Body: FormBody }>;

const AVATAR_UPLOAD = new Set(['upload_avatar', 'upload_avatar2']);

export class ProfileController {
	readonly #edit: ProfileEditController;
	readonly #avatar: AvatarController;
	readonly #account: AccountDeleteController;

	constructor(private readonly deps: ProfileControllerDeps) {
		this.#edit = new ProfileEditController(deps);
		this.#avatar = new AvatarController(deps);
		this.#account = new AccountDeleteController(deps);
	}

	show = async (request: ProfileRequest, reply: AppReply): Promise<AppReply> => {
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

	/** Formulaires POST : actions, puis sections. */
	submit = async (request: ProfilePost, reply: AppReply): Promise<AppReply> => {
		const { query } = request;
		const { lang } = this.deps.page;
		switch (query.action) {
			case undefined:
				break;
			case 'delete_avatar':
				return this.#avatar.delete(request, reply);
			case 'delete_account':
				return this.#account.delete(request, reply);
			default:
				if (AVATAR_UPLOAD.has(query.action)) return this.#avatar.upload(request, reply);
				return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
		}
		if (isProfileSection(query.section)) return this.#edit.submit(request, reply, query.section);
		return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
	};

	private showAction(request: ProfileRequest, reply: AppReply): Promise<AppReply> {
		const action = request.query.action ?? '';
		if (AVATAR_UPLOAD.has(action)) return this.#avatar.uploadForm(request, reply);
		if (action === 'delete_avatar') return this.#avatar.deleteForm(request, reply);
		if (action === 'delete_account') return this.#account.confirm(request, reply);
		return renderMessage(request, reply, this.deps, 404, this.deps.page.lang.common.badRequest);
	}
}
