/**
 * Contrôleur de profile.php, pour la seule consultation d'un profil.
 *
 * profile.php sert aussi à modifier un profil (le sien, ou celui d'un membre pour un modérateur
 * autorisé) et à ses actions (mot de passe, avatar, plugiles…). Ces cas restent servis par le PHP
 * jusqu'au lot Profil : Node y redirige avec la même adresse.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildProfilePage } from '../presenters/profilePage.ts';
import type { BanReader } from '../repositories/BanRepository.ts';
import type { CensorReader } from '../repositories/CensorRepository.ts';
import type { ProfileReader } from '../repositories/UserRepository.ts';
import type { AvatarLocator } from '../services/avatars.ts';
import { buildCensor } from '../services/censor.ts';
import { canEditProfile } from '../services/permissions.ts';
import { positiveInt } from './params.ts';

export interface ProfileControllerDeps extends LayoutDeps {
	profiles: ProfileReader;
	bans: BanReader;
	censorship: CensorReader;
	avatars: AvatarLocator;
	/** Installation PHP, qui garde la modification des profils. */
	legacyBaseUrl: string;
}

export interface ProfileQuery {
	id?: string;
	section?: string;
	action?: string;
	plugin?: string;
}

/** Plugile dont la consultation par un autre membre est portée (biographie, propre à PV). */
const BIOGRAPHY_PLUGIN = 'UP_Ma_biographie.php';

export class ProfileController {
	constructor(private readonly deps: ProfileControllerDeps) {}

	show = async (request: FastifyRequest<{ Querystring: ProfileQuery }>, reply: FastifyReply): Promise<FastifyReply> => {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		const { query } = request;
		const id = positiveInt(query.id);

		// Sans installation PHP (LEGACY_BASE_URL vide), rediriger bouclerait sur Node : on consulte seulement.
		const legacy = this.deps.legacyBaseUrl !== '';

		// Actions (changement de mot de passe par lien d'activation…) : contrôles faits par le PHP.
		if (query.action !== undefined)
			return legacy ? this.toLegacy(request, reply) : renderMessage(request, reply, this.deps, 404, lang.common.badRequest);

		if (id < 2) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
		if (!viewer.group.canReadBoard) return renderMessage(request, reply, this.deps, 403, lang.common.noView);
		if (!viewer.group.canViewUsers && (viewer.isGuest || viewer.id !== id))
			return renderMessage(request, reply, this.deps, 403, lang.common.noPermission);

		const profile = await this.deps.profiles.findProfile(id);
		if (profile === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);

		const otherPlugin = query.plugin !== undefined && query.plugin !== BIOGRAPHY_PLUGIN;
		if (legacy && (canEditProfile(viewer, profile) || query.section !== undefined || otherPlugin)) return this.toLegacy(request, reply);

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

	/** Même adresse sur l'installation PHP (modification du profil, actions, autres plugiles). */
	private toLegacy(request: FastifyRequest, reply: FastifyReply): FastifyReply {
		const search = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
		return reply.redirect(`${this.deps.legacyBaseUrl}/profile.php${search}`);
	}
}
