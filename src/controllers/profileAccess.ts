/**
 * Accès commun aux pages de modification de profile.php (sections, actions, plugiles) : le membre
 * existe et le lecteur a le droit de modifier son profil, sinon une page d'erreur est renvoyée.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { EditableProfile } from '../domain/models.ts';
import { type LayoutDeps, renderMessage } from '../http/layout.ts';
import type { ProfileStore } from '../repositories/ProfileRepository.ts';
import { canEditProfile } from '../services/permissions.ts';
import { positiveInt } from './params.ts';

export interface ProfileAccessDeps extends LayoutDeps {
	profileStore: ProfileStore;
}

/** Paramètres de requête de profile.php. */
export interface ProfileQuery {
	id?: string;
	section?: string;
	action?: string;
	plugin?: string;
	key?: string;
	updated?: string;
}

/**
 * Profil modifiable par le lecteur, ou la réponse d'erreur déjà envoyée. `allow` remplace la règle
 * générale (canEditProfile()) pour les actions qui ont la leur (mot de passe, adresse).
 */
export async function loadEditableProfile(
	request: FastifyRequest<{ Querystring: ProfileQuery }>,
	reply: FastifyReply,
	deps: ProfileAccessDeps,
	allow: (profile: EditableProfile) => boolean = (profile) => canEditProfile(request.viewer, profile),
): Promise<EditableProfile | FastifyReply> {
	const { lang } = deps.page;
	const id = positiveInt(request.query.id);
	if (id < 2) return renderMessage(request, reply, deps, 404, lang.common.badRequest);
	if (!request.viewer.group.canReadBoard) return renderMessage(request, reply, deps, 403, lang.common.noView);

	const profile = await deps.profileStore.findEditableProfile(id);
	if (profile === null) return renderMessage(request, reply, deps, 404, lang.common.badRequest);
	if (!allow(profile)) return renderMessage(request, reply, deps, 403, lang.common.noPermission);
	return profile;
}

/** Garde de type : loadEditableProfile() a-t-il renvoyé un profil ou une réponse ? */
export const isProfile = (value: EditableProfile | FastifyReply): value is EditableProfile => 'registrationIp' in value;
