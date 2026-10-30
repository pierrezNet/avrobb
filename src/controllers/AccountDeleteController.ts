/**
 * Suppression de son compte par le membre (profile.php?action=delete_account&id=…, propre à
 * AvroBB, exigée par la politique de confidentialité) : confirmation, puis suppression en POST.
 * Les messages publics restent, sous un nom anonyme ; l'avatar est effacé après la base.
 * Un administrateur ne peut pas supprimer son propre compte (canDeleteOwnAccount()).
 */

import type { CookieConfig } from '../config.ts';
import type { AppReply, AppRequest } from '../http/context.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { clearSessionCookie } from '../http/session.ts';
import type { AccountStore } from '../repositories/AccountRepository.ts';
import type { AvatarStore } from '../repositories/AvatarFiles.ts';
import { canDeleteOwnAccount } from '../services/permissions.ts';
import { positiveInt } from './params.ts';
import type { ProfileQuery } from './profileAccess.ts';

export interface AccountDeleteControllerDeps extends LayoutDeps {
	accountStore: AccountStore;
	avatarStore: AvatarStore;
	cookie: CookieConfig;
}

type AccountRequest = AppRequest<{ Querystring: ProfileQuery }>;

export class AccountDeleteController {
	constructor(private readonly deps: AccountDeleteControllerDeps) {}

	confirm = async (request: AccountRequest, reply: AppReply): Promise<AppReply> => {
		const userId = this.#ownAccount(request);
		if (userId === null) return renderMessage(request, reply, this.deps, 403, this.deps.page.lang.common.noPermission);
		const { lang } = this.deps.page;
		return renderPage(
			request,
			reply,
			this.deps,
			'confirm.njk',
			{ pageId: 'profile', titleParts: [request.board.boardTitle, lang.common.profile, lang.profile.deleteAccount], activeNav: 'profile' },
			{
				title: lang.profile.confirmDeleteAccount,
				text: lang.profile.confirmDeleteAccountInfo,
				action: `profile.php?action=delete_account&id=${userId}`,
				button: lang.profile.deleteAccount,
			},
		);
	};

	delete = async (request: AccountRequest, reply: AppReply): Promise<AppReply> => {
		const userId = this.#ownAccount(request);
		if (userId === null) return renderMessage(request, reply, this.deps, 403, this.deps.page.lang.common.noPermission);
		await this.deps.accountStore.deleteAccount(userId, request.viewer.username, this.deps.page.lang.profile.deletedMember);
		// Après la base : au pire, un fichier orphelin (effacé par la tâche planifiée).
		await this.deps.avatarStore.delete(userId, request.board.avatarsDir);
		clearSessionCookie(reply, this.deps);
		return reply.redirect('index.php', 303);
	};

	/** Le compte du lecteur, s'il est bien celui désigné par ?id= et qu'il peut le supprimer. */
	#ownAccount(request: AccountRequest): number | null {
		const id = positiveInt(request.query.id);
		return id > 0 && canDeleteOwnAccount(request.viewer, id) ? id : null;
	}
}
