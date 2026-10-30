/**
 * Fichiers pour les moteurs de recherche (AvroBB ; le PHP n'en servait pas) : robots.txt (pages
 * de formulaire et d'administration exclues) et sitemap.xml (accueil, pages d'information, forums
 * et discussions lisibles par un invité).
 */

import type { AppReply, AppRequest } from '../http/context.ts';
import { forumUrl } from '../presenters/forumPage.ts';
import { sitemapXml } from '../presenters/sitemap.ts';
import { topicUrl } from '../presenters/topicPage.ts';
import type { ConfigReader } from '../repositories/ConfigLoader.ts';
import type { SitemapReader } from '../repositories/SitemapRepository.ts';
import { robotsTxt } from '../services/seo.ts';
import { STATIC_PAGE_IDS } from '../services/staticPageConfig.ts';

export interface SeoControllerDeps {
	config: ConfigReader;
	sitemap: SitemapReader;
}

/** Limite d'un fichier sitemap (protocole sitemaps.org). */
const SITEMAP_MAX = 50000;

export class SeoController {
	constructor(private readonly deps: SeoControllerDeps) {}

	robots = async (_request: AppRequest, reply: AppReply): Promise<AppReply> => {
		const config = await this.deps.config.load();
		return reply.type('text/plain; charset=utf-8').send(robotsTxt(config.baseUrl));
	};

	sitemap = async (_request: AppRequest, reply: AppReply): Promise<AppReply> => {
		const config = await this.deps.config.load();
		const forums = await this.deps.sitemap.listForums();
		const topics = await this.deps.sitemap.listTopics(SITEMAP_MAX - forums.length - STATIC_PAGE_IDS.length - 1);
		const xml = sitemapXml(config.baseUrl, [
			{ path: 'index.php', lastPost: Math.max(0, ...forums.map((forum) => forum.lastPost)) },
			...STATIC_PAGE_IDS.map((id) => ({ path: `${id}.php`, lastPost: config.staticPages[id]?.updatedAt ?? 0 })),
			...forums.map((forum) => ({ path: forumUrl(forum.id), lastPost: forum.lastPost })),
			...topics.map((topic) => ({ path: topicUrl(topic.id), lastPost: topic.lastPost })),
		]);
		return reply.type('application/xml; charset=utf-8').header('Cache-Control', 'public, max-age=3600').send(xml);
	};
}
