/**
 * Commun aux pages d'administration (admin_*.php) : contrôle d'accès (modérateurs ou
 * administrateurs, comme $pun_user['is_admmod'] et g_id == PUN_ADMIN) et rendu dans la mise en
 * page de l'administration, avec son menu.
 */

import type { AppReply, AppRequest } from '../http/context.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { type AdminPage, buildAdminMenu } from '../presenters/adminMenu.ts';
import { isAdmin, isAnyModerator } from '../services/permissions.ts';

/** Réponse 403 si le lecteur n'est ni administrateur ni modérateur (ou pas administrateur si `adminOnly`). */
export function adminDenied(request: AppRequest, reply: AppReply, deps: LayoutDeps, adminOnly: boolean): Promise<AppReply> | null {
	const allowed = adminOnly ? isAdmin(request.viewer) : isAnyModerator(request.viewer);
	return allowed ? null : renderMessage(request, reply, deps, 403, deps.page.lang.common.noPermission);
}

/** Rend une page d'administration : `view` reçoit en plus `menu` (menu d'administration). */
export function renderAdminPage(
	request: AppRequest,
	reply: AppReply,
	deps: LayoutDeps,
	options: { active: AdminPage; template: string; title: string },
	view: object,
): Promise<AppReply> {
	const { lang } = deps.page;
	const menu = buildAdminMenu(request.viewer, request.board, options.active, lang);
	return renderPage(
		request,
		reply,
		deps,
		options.template,
		{ pageId: `admin_${options.active}`, titleParts: [request.board.boardTitle, lang.admin.admin, options.title], activeNav: 'admin' },
		{ ...view, menu },
	);
}
