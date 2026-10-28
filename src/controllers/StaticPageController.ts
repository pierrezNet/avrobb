/**
 * Pages d'information d'AvroBB (pied de page) : termes et règles (terms.php), politique de
 * confidentialité (privacy.php) et aide (faq.php). Textes dans src/lang/fr/staticPages.ts ;
 * accessibles à tous, même sans le droit de lire le forum.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type LayoutDeps, renderPage } from '../http/layout.ts';
import { buildStaticPage, type StaticPageId } from '../presenters/staticPage.ts';

export class StaticPageController {
	constructor(private readonly deps: LayoutDeps) {}

	show =
		(id: StaticPageId) =>
		(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
			const view = buildStaticPage(id, this.deps.page.lang, request.board.adminEmail);
			return renderPage(
				request,
				reply,
				this.deps,
				'static_page.njk',
				{ pageId: id, titleParts: [request.board.boardTitle, view.title], allowIndex: true, canonicalUrl: `${id}.php` },
				view,
			);
		};
}
