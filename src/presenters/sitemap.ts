/**
 * Plan du site au format sitemaps.org : adresses absolues échappées, date du dernier message en
 * lastmod (jour UTC). Chaque page y figure dans les deux langues, avec ses équivalents (hreflang).
 * Fonction pure.
 */

import { absoluteUrl, type Locale } from '../services/routes.ts';

const LOCALES: readonly Locale[] = ['fr', 'en'];

const escapeXml = (text: string): string =>
	text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] ?? char);

export function sitemapXml(baseUrl: string, entries: readonly { path: string; lastPost: number }[]): string {
	const urls = entries.flatMap((entry) => {
		const lastmod = entry.lastPost > 0 ? `<lastmod>${new Date(entry.lastPost * 1000).toISOString().slice(0, 10)}</lastmod>` : '';
		const alternates = LOCALES.map(
			(locale) => `<xhtml:link rel="alternate" hreflang="${locale}" href="${escapeXml(absoluteUrl(baseUrl, entry.path, locale))}"/>`,
		).join('');
		return LOCALES.map((locale) => `\t<url><loc>${escapeXml(absoluteUrl(baseUrl, entry.path, locale))}</loc>${lastmod}${alternates}</url>`);
	});
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
		...urls,
		'</urlset>',
		'',
	].join('\n');
}
