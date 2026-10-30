/**
 * Plan du site au format sitemaps.org : adresses absolues échappées, date du dernier message en
 * lastmod (jour UTC). Fonction pure.
 */

import { absoluteUrl } from '../services/routes.ts';

const escapeXml = (text: string): string =>
	text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] ?? char);

export function sitemapXml(baseUrl: string, entries: readonly { path: string; lastPost: number }[]): string {
	const urls = entries.map((entry) => {
		const lastmod = entry.lastPost > 0 ? `<lastmod>${new Date(entry.lastPost * 1000).toISOString().slice(0, 10)}</lastmod>` : '';
		return `\t<url><loc>${escapeXml(absoluteUrl(baseUrl, entry.path))}</loc>${lastmod}</url>`;
	});
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		...urls,
		'</urlset>',
		'',
	].join('\n');
}
