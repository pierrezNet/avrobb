/**
 * Données communes à toutes les pages (en-tête, menu, pied), l'équivalent de header.php/footer.php
 * mais calculé avant le rendu : la page est envoyée en une fois, à la fin.
 */

import type { FastifyReply } from 'fastify';
import type { BoardConfig, Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr.ts';
import type { DateWords } from '../services/dateFormat.ts';

/** Dépendances de présentation partagées par les contrôleurs. */
export interface PageContext {
	lang: Lang;
	dateWords: DateWords;
	/** Heure courante en secondes Unix (injectable pour les tests). */
	clock: () => number;
}

export interface MenuItem {
	id: string;
	label: string;
	href: string;
	active: boolean;
}

export function layoutContext(viewer: Viewer, config: BoardConfig, page: PageContext, pageId: string, titleParts: readonly string[]) {
	const { lang } = page;
	const menu: MenuItem[] = [{ id: 'navindex', label: lang.index, href: 'index.php', active: pageId === 'viewtopic' }];

	if (viewer.group.canViewUsers) menu.push({ id: 'navuserlist', label: lang.userList, href: 'userlist.php', active: false });

	menu.push({ id: 'navsearch', label: lang.search, href: 'search.php', active: false });

	if (viewer.isGuest) {
		menu.push({ id: 'navregister', label: lang.register, href: 'register.php', active: false });
		menu.push({ id: 'navlogin', label: lang.login, href: 'login.php', active: false });
	} else {
		menu.push({ id: 'navprofile', label: lang.profile, href: `profile.php?id=${viewer.id}`, active: false });
	}

	return {
		lang,
		pageId,
		pageTitle: titleParts.join(' / '),
		boardTitle: config.boardTitle,
		menu,
		viewer: { isGuest: viewer.isGuest, username: viewer.username },
	};
}

export function renderMessage(
	reply: FastifyReply,
	status: number,
	message: string,
	viewer: Viewer,
	config: BoardConfig,
	page: PageContext,
): FastifyReply {
	return reply.code(status).view('message.njk', {
		...layoutContext(viewer, config, page, 'message', [config.boardTitle, page.lang.info]),
		message,
	});
}
