/**
 * Contrôleur de help.php : aide BBCode et émoticônes.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildHelpPage } from '../presenters/helpPage.ts';

export class HelpController {
	constructor(private readonly deps: LayoutDeps) {}

	show = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;

		if (!viewer.group.canReadBoard) return renderMessage(request, reply, this.deps, 403, lang.common.noView);

		return renderPage(
			request,
			reply,
			this.deps,
			'help.njk',
			{ pageId: 'help', titleParts: [config.boardTitle, lang.help.help], activeNav: 'none' },
			buildHelpPage(config, lang),
		);
	};
}
