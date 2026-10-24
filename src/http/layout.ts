/**
 * Rendu des pages dans la mise en page commune, l'équivalent de header.php/footer.php mais calculé
 * avant le rendu : la page est envoyée en une fois, à la fin.
 *
 * Seules les données réellement affichées sont chargées : signalements pour les modérateurs,
 * MP si la messagerie est active pour le membre, forums si la liste « Atteindre » est activée.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Lang } from '../lang/fr/index.ts';
import { buildLayout, buildMinimalLayout, type LayoutView, type PageOptions } from '../presenters/layout.ts';
import type { ForumReader } from '../repositories/ForumRepository.ts';
import type { PrivateMessageReader } from '../repositories/PrivateMessageRepository.ts';
import type { ReportReader } from '../repositories/ReportRepository.ts';
import { escapeHtml } from '../services/bbcode.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import { canUsePrivateMessages, isAnyModerator } from '../services/permissions.ts';
import type { SessionBlock } from './session.ts';

/** Dépendances de présentation partagées par les contrôleurs. */
export interface PageContext {
	lang: Lang;
	dateWords: DateWords;
	/** Heure courante en secondes Unix (injectable pour les tests). */
	clock: () => number;
}

export interface LayoutDeps {
	forums: ForumReader;
	reports: ReportReader;
	privateMessages: PrivateMessageReader;
	page: PageContext;
}

export async function loadLayout(request: FastifyRequest, deps: LayoutDeps, options: PageOptions): Promise<LayoutView> {
	const { viewer, board: config } = request;

	const [pendingReports, unreadPrivateMessages, forums] = await Promise.all([
		isAnyModerator(viewer) && config.reportsByBoard ? deps.reports.hasPending() : false,
		canUsePrivateMessages(viewer, config) ? deps.privateMessages.countUnread(viewer.id) : 0,
		config.quickjump && viewer.group.canReadBoard ? deps.forums.listReadable(viewer.group.id) : null,
	]);

	return buildLayout({
		viewer,
		config,
		lang: deps.page.lang,
		dateWords: deps.page.dateWords,
		now: deps.page.clock(),
		remoteAddress: request.ip,
		options,
		pendingReports,
		unreadPrivateMessages,
		forums,
	});
}

/** Rend `template` dans la mise en page ; la vue reçoit `layout`, `lang` et `view`. */
export async function renderPage(
	request: FastifyRequest,
	reply: FastifyReply,
	deps: LayoutDeps,
	template: string,
	options: PageOptions,
	view: object,
): Promise<FastifyReply> {
	const layout = await loadLayout(request, deps, options);
	return sendView(reply, template, { layout, lang: layout.lang, view });
}

/** Rendu complet avant envoi : une erreur de gabarit remonte à l'appelant au lieu de partir au client. */
async function sendView(reply: FastifyReply, template: string, data: object): Promise<FastifyReply> {
	const html = await reply.viewAsync(template, data);
	return reply.type('text/html; charset=utf-8').send(html);
}

/** Page d'information (message() de FluxBB) avec le statut HTTP voulu. */
export async function renderMessage(
	request: FastifyRequest,
	reply: FastifyReply,
	deps: LayoutDeps,
	status: number,
	message: string,
): Promise<FastifyReply> {
	const { lang } = deps.page;
	reply.code(status);
	return renderPage(
		request,
		reply,
		deps,
		'message.njk',
		{ pageId: 'message', titleParts: [request.board.boardTitle, lang.common.info] },
		{ message },
	);
}

/** Page de maintenance (maintenance_message()) ou de bannissement (check_bans()). */
export async function renderBlock(
	request: FastifyRequest,
	reply: FastifyReply,
	deps: LayoutDeps,
	block: SessionBlock,
): Promise<FastifyReply> {
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
export async function renderMinimalMessage(reply: FastifyReply, lang: Lang, status: number, message: string): Promise<FastifyReply> {
	const layout = buildMinimalLayout(lang, lang.common.info);
	reply.code(status);
	try {
		return await sendView(reply, 'message.njk', { layout, lang, view: { message } });
	} catch (error) {
		// Dernier recours si les gabarits eux-mêmes sont en cause : page statique, sans détail technique.
		reply.log.error({ err: error }, "Échec du rendu de la page d'erreur minimale");
		return reply.type('text/html; charset=utf-8').send(staticErrorPage(lang, message));
	}
}

function staticErrorPage(lang: Lang, message: string): string {
	return `<!DOCTYPE html><html lang="${lang.common.langCode}"><head><meta charset="utf-8"><title>${lang.common.info}</title></head><body><p>${escapeHtml(message)}</p></body></html>`;
}
