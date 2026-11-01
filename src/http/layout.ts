/**
 * Rendu des pages dans la mise en page commune, l'équivalent de header.php/footer.php mais calculé
 * avant le rendu : la page est envoyée en une fois, à la fin.
 *
 * Seules les données réellement affichées sont chargées : signalements pour les modérateurs,
 * MP si la messagerie est active pour le membre, forums si la liste « Atteindre » est activée.
 */

import type { Lang } from '../lang/fr/index.ts';
import { buildLayout, buildMinimalLayout, type LayoutView, type PageOptions } from '../presenters/layout.ts';
import type { ForumReader } from '../repositories/ForumRepository.ts';
import type { PrivateMessageReader } from '../repositories/PrivateMessageRepository.ts';
import type { ReportReader } from '../repositories/ReportRepository.ts';
import { escapeHtml } from '../services/bbcode.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import { canUsePrivateMessages, isAnyModerator } from '../services/permissions.ts';
import type { Locale } from '../services/routes.ts';
import type { AppReply, AppRequest } from './context.ts';
import type { SessionBlock } from './session.ts';
import type { ViewRenderer } from './views.ts';

/** Dépendances de présentation partagées par les contrôleurs. */
export interface PageContext {
	/** Langue de l'instance : chaque langue a la sienne (worker.ts), avec ses textes et ses adresses. */
	locale: Locale;
	lang: Lang;
	dateWords: DateWords;
	/** Heure courante en secondes Unix (injectable pour les tests). */
	clock: () => number;
}

export interface LayoutDeps {
	/** Gabarits précompilés, avec leurs fonctions globales (url, asset). */
	views: ViewRenderer;
	forums: ForumReader;
	reports: ReportReader;
	privateMessages: PrivateMessageReader;
	page: PageContext;
}

export async function loadLayout(request: AppRequest, deps: LayoutDeps, options: PageOptions): Promise<LayoutView> {
	const { viewer, board: config } = request;

	const [pendingReports, unreadPrivateMessages] = await Promise.all([
		isAnyModerator(viewer) && config.reportsByBoard ? deps.reports.hasPending() : false,
		canUsePrivateMessages(viewer, config) ? deps.privateMessages.countUnread(viewer.id) : 0,
	]);

	return buildLayout({
		viewer,
		config,
		locale: deps.page.locale,
		// Adresse française de la page : l'instance anglaise reçoit les adresses déjà ramenées au français.
		currentPath: request.url,
		lang: deps.page.lang,
		dateWords: deps.page.dateWords,
		now: deps.page.clock(),
		csrfToken: request.csrfToken,
		options,
		pendingReports,
		unreadPrivateMessages,
	});
}

/** Rend `template` dans la mise en page ; la vue reçoit `layout`, `lang` et `view`. */
export async function renderPage(
	request: AppRequest,
	reply: AppReply,
	deps: LayoutDeps,
	template: string,
	options: PageOptions,
	view: object,
): Promise<AppReply> {
	const layout = await loadLayout(request, deps, options);
	return sendView(deps.views, reply, template, { layout, lang: layout.lang, view });
}

/** Rendu complet avant envoi : une erreur de gabarit remonte à l'appelant au lieu de partir au client. */
function sendView(views: ViewRenderer, reply: AppReply, template: string, data: object): AppReply {
	const html = views.render(template, data);
	return reply.type('text/html; charset=utf-8').send(html);
}

/** Page d'information (message() de FluxBB) avec le statut HTTP voulu. */
export async function renderMessage(
	request: AppRequest,
	reply: AppReply,
	deps: LayoutDeps,
	status: number,
	message: string,
	link: { href: string; label: string } | null = null,
): Promise<AppReply> {
	const { lang } = deps.page;
	reply.code(status);
	return renderPage(
		request,
		reply,
		deps,
		'message.njk',
		{ pageId: 'message', titleParts: [request.board.boardTitle, lang.common.info] },
		{ message, link },
	);
}

/** Page de maintenance (maintenance_message()) ou de bannissement (check_bans()). */
export async function renderBlock(request: AppRequest, reply: AppReply, deps: LayoutDeps, block: SessionBlock): Promise<AppReply> {
	const { lang } = deps.page;
	const config = request.board;

	if (block.kind === 'maintenance') {
		reply.code(503).header('Retry-After', '3600');
		return renderPage(
			request,
			reply,
			deps,
			'maintenance.njk',
			{ pageId: 'maint', titleParts: [config.boardTitle, lang.common.maintenance] },
			{
				messageHtml: config.maintenanceMessage,
				preview: null,
			},
		);
	}

	const viewer = request.viewer;
	const expires =
		block.expire !== null
			? formatTime(block.expire, viewerTimeSettings(viewer), deps.page.dateWords, deps.page.clock(), true).toLowerCase()
			: null;
	reply.code(403);
	return renderPage(
		request,
		reply,
		deps,
		'banned.njk',
		{ pageId: 'message', titleParts: [config.boardTitle, lang.common.info] },
		{
			expires,
			reason: block.message !== '' ? block.message : null,
			adminEmail: config.adminEmail,
		},
	);
}

/** Message d'erreur sans base ni utilisateur (voir buildMinimalLayout()). */
export async function renderMinimalMessage(
	views: ViewRenderer,
	reply: AppReply,
	lang: Lang,
	status: number,
	message: string,
): Promise<AppReply> {
	const layout = buildMinimalLayout(lang, lang.common.info);
	reply.code(status);
	try {
		return sendView(views, reply, 'message.njk', { layout, lang, view: { message, link: null } });
	} catch (error) {
		// Dernier recours si les gabarits eux-mêmes sont en cause : page statique, sans détail technique.
		reply.log.error({ err: error }, "Échec du rendu de la page d'erreur minimale");
		return reply.type('text/html; charset=utf-8').send(staticErrorPage(lang, message));
	}
}

function staticErrorPage(lang: Lang, message: string): string {
	return `<!DOCTYPE html><html lang="${lang.common.langCode}"><head><meta charset="utf-8"><title>${lang.common.info}</title></head><body><p>${escapeHtml(message)}</p></body></html>`;
}
