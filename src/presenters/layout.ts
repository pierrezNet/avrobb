/**
 * Modèle de vue de la mise en page commune : ce que header.php et footer.php (et les ajouts du mod
 * APMS, plugins/apms/header_add*.php) calculaient en concaténant du HTML.
 *
 * Fonction pure : les compteurs (signalements, MP) et la liste des forums sont chargés avant, par
 * src/http/layout.ts, et seulement quand ils servent.
 */

import type { BoardConfig, Topic, Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import { headerImageHref } from '../services/headerImages.ts';
import { canSearch, canUsePrivateMessages, isAnyModerator, isForumModerator } from '../services/permissions.ts';
import { plainExcerpt } from '../services/seo.ts';
import { resolveTheme, type Theme } from '../services/themes.ts';

/** Onglet du menu principal mis en évidence (PUN_ACTIVE_PAGE). */
export type NavId =
	| 'index'
	| 'userlist'
	| 'rules'
	| 'search'
	| 'gallery'
	| 'drafts'
	| 'register'
	| 'login'
	| 'profile'
	| 'pm'
	| 'admin'
	| 'none';

/** Pied de page propre à certaines pages ($footer_style de footer.php). */
export type FooterContext =
	| { kind: 'default' }
	| { kind: 'index' }
	| { kind: 'viewforum'; forum: { id: number; moderators: ReadonlyMap<string, number> }; page: number }
	| { kind: 'viewtopic'; topic: Topic; page: number };

export interface PageOptions {
	/** Suffixe de l'identifiant du conteneur (« pun<pageId> »), comme basename($_SERVER['PHP_SELF']). */
	pageId: string;
	/** Parties du titre du plus général au plus précis ($page_title) ; affichées en ordre inverse. */
	titleParts: readonly string[];
	/** Numéro de page ajouté au titre (« (Page 2) ») ; null pour ne rien ajouter. */
	pageNumber?: number | null;
	activeNav?: NavId;
	footer?: FooterContext;
	/** PUN_ALLOW_INDEX : sinon la page demande aux robots de ne pas l'indexer. */
	allowIndex?: boolean;
	canonicalUrl?: string | null;
	/** Balise description et aperçu de partage ; à défaut, la description du forum. */
	description?: string | null;
	/** Image de l'aperçu de partage (adresse absolue) ; à défaut, l'icône du forum. */
	image?: string | null;
	/** og:type : « article » pour une discussion, « website » sinon. */
	shareType?: 'website' | 'article';
}

/** Référencement et aperçu de partage (Open Graph) d'une page indexable. */
export interface PageMeta {
	description: string | null;
	title: string;
	siteName: string;
	/** Adresse canonique absolue, ou null. */
	url: string | null;
	image: string;
	type: 'website' | 'article';
}

export interface NavLink {
	id: string;
	href: string;
	label: string;
	/** Libellé développé quand `label` est une abréviation (« MP »). */
	abbrTitle: string | null;
	/** Pastille du nombre de nouveautés (MP non lus). */
	count: number | null;
	active: boolean;
	/** Menu burger seulement : sur grand écran, le lien est dans la ligne d'état (Administration). */
	mobileOnly: boolean;
	/** Lien supplémentaire saisi par l'administrateur (o_additional_navlinks), HTML brut. */
	trustedHtml: string | null;
	/** Action qui écrit (déconnexion) : bouton d'un formulaire POST avec jeton CSRF, pas un lien. */
	post: boolean;
}

export interface QuickSearch {
	href: string;
	label: string;
	title: string;
}

export type PrivateMessageBox =
	| { kind: 'empty'; text: string }
	| { kind: 'full'; text: string }
	| { kind: 'filled'; text: string; percent: number };

export interface StatusView {
	username: string;
	lastVisit: string;
	showAdminLink: boolean;
	pendingReports: boolean;
	maintenance: boolean;
	privateMessageBox: PrivateMessageBox | null;
}

export interface FeedLink {
	href: string;
	label: string;
	mimeType: 'application/rss+xml';
	cssClass: 'rss';
}

/** Lien du pied de page (pages d'information d'AvroBB). */
export interface FooterLink {
	href: string;
	label: string;
	active: boolean;
}

export interface LayoutView {
	lang: Lang;
	pageId: string;
	pageTitle: string;
	boardTitle: string;
	theme: Theme;
	robotsNoIndex: boolean;
	canonicalUrl: string | null;
	meta: PageMeta;
	nav: NavLink[];
	status: StatusView | null;
	quickSearches: QuickSearch[];
	/** HTML saisi par l'administrateur (o_announcement_message), affiché tel quel comme en PHP. */
	announcementHtml: string | null;
	feed: FeedLink | null;
	modControls: ModControl[];
	/** Pages d'information (termes, confidentialité, aide), à la place de la liste « Atteindre ». */
	footerLinks: FooterLink[];
	/** Jeton CSRF à placer dans les formulaires POST (partials/forms.njk). */
	csrfToken: string;
	/**
	 * Complètement des noms de membres (@mention, destinataires) : début de l'adresse des profils, ou
	 * null si le lecteur ne peut pas consulter la liste des membres.
	 */
	memberSuggest: { profileBase: string } | null;
	/** Logo et bannière de l'en-tête (page Apparence), adresses versionnées. */
	header: { logoHref: string; bannerHref: string };
	/** Visiteur banni : il lit le forum mais n'écrit plus (bandeau sous l'en-tête). */
	ban: { expires: string | null; reason: string | null } | null;
}

export interface LayoutInput {
	viewer: Viewer;
	config: BoardConfig;
	lang: Lang;
	dateWords: DateWords;
	now: number;
	csrfToken: string;
	options: PageOptions;
	pendingReports: boolean;
	unreadPrivateMessages: number;
}

/** Image d'aperçu de partage par défaut : l'icône du forum (public/icons). */
const SHARE_IMAGE = 'assets/icons/icon-512.png';

/** generate_page_title() : parties inversées, « (Page N) » ajouté à la plus précise. */
export function pageTitle(parts: readonly string[], pageNumber: number | null, lang: Lang): string {
	const reversed = [...parts].reverse();
	if (pageNumber !== null && reversed.length > 0) reversed[0] = `${reversed[0]} (${lang.common.page(pageNumber)})`;
	return reversed.join(lang.common.titleSeparator);
}

function link(id: string, href: string, label: string, active: boolean): NavLink {
	return { id, href, label, abbrTitle: null, count: null, active, trustedHtml: null, mobileOnly: false, post: false };
}

/**
 * o_additional_navlinks : une ligne « position = HTML » par lien, insérée à cette position
 * (preg_match_all + array_splice de header.php).
 */
function insertAdditionalLinks(links: NavLink[], source: string): void {
	const pattern = /([0-9]+)\s*=\s*(.*?)\n/gs;
	let index = 0;

	for (const [, position = '0', html = ''] of `${source}\n`.matchAll(pattern)) {
		index++;
		links.splice(Number(position), 0, { ...link(`navextra${index}`, '', '', false), trustedHtml: html });
	}
}

function buildNav(input: LayoutInput): NavLink[] {
	const { viewer, config, lang, options } = input;
	const active = options.activeNav ?? 'none';
	const t = lang.common;
	const links = [link('navindex', 'index.php', t.index, active === 'index')];

	if (viewer.group.canReadBoard && viewer.group.canViewUsers)
		links.push(link('navuserlist', 'userlist.php', t.userList, active === 'userlist'));

	if (config.rules && (!viewer.isGuest || viewer.group.canReadBoard || config.registrationsAllowed))
		links.push(link('navrules', 'misc.php?action=rules', t.rules, active === 'rules'));

	if (canSearch(viewer)) links.push(link('navsearch', 'search.php', t.search, active === 'search'));

	// Ajouts au menu de PV, dans son ordre : galerie après le profil, puis brouillons (membres).
	const gallery = viewer.group.canReadBoard ? [link('navgallery', 'gallery.php', t.gallery, active === 'gallery')] : [];

	if (viewer.isGuest) {
		links.push(...gallery);
		links.push(link('navlogin', 'login.php', t.login, active === 'login'));
	} else {
		links.push(link('navprofile', `profile.php?id=${viewer.id}`, t.profile, active === 'profile'));
		links.push(...gallery);
		links.push(link('navdrafts', 'draft_list.php', t.drafts, active === 'drafts'));

		if (canUsePrivateMessages(viewer, config)) {
			const unread = input.unreadPrivateMessages;
			links.push({
				...link('navpm', 'pms_inbox.php', lang.pms.pmAbbr, active === 'pm'),
				abbrTitle: lang.pms.pmTitle,
				count: unread > 0 ? unread : null,
			});
		}

		if (isAnyModerator(viewer)) links.push({ ...link('navadminmenu', 'admin_index.php', t.admin, active === 'admin'), mobileOnly: true });

		links.push({ ...link('navlogout', 'login.php?action=out', t.logout, false), post: true });
	}

	if (viewer.group.canReadBoard && config.additionalNavlinks !== '') insertAdditionalLinks(links, config.additionalNavlinks);

	return links;
}

/** État des boîtes de MP (header_add1.php) : seulement si le groupe a une limite et n'est pas modérateur. */
function privateMessageBox(viewer: Viewer, lang: Lang): PrivateMessageBox | null {
	const limit = viewer.group.privateMessageLimit;
	const count = viewer.privateMessageCount;

	if (limit === 0 || isAnyModerator(viewer)) return null;
	if (count <= 0) return { kind: 'empty', text: lang.pms.emptyBoxes };
	if (count >= limit) return { kind: 'full', text: lang.pms.fullBoxes };

	const percent = Math.ceil((count / limit) * 100);
	return { kind: 'filled', text: lang.pms.fullTo(percent), percent };
}

function buildStatus(input: LayoutInput): StatusView | null {
	const { viewer, config, lang } = input;

	if (viewer.isGuest) return null;

	const time = viewerTimeSettings(viewer);
	const isAdmMod = isAnyModerator(viewer);
	const pms = canUsePrivateMessages(viewer, config);

	return {
		username: viewer.username,
		lastVisit: lang.common.lastVisit(formatTime(viewer.lastVisit, time, input.dateWords, input.now)),
		showAdminLink: isAdmMod,
		pendingReports: isAdmMod && config.reportsByBoard && input.pendingReports,
		maintenance: isAdmMod && config.maintenance,
		// Les MP non lus ne sont signalés que par la pastille du menu (AvroBB), plus par un message.
		privateMessageBox: pms ? privateMessageBox(viewer, lang) : null,
	};
}

function buildQuickSearches(viewer: Viewer, lang: Lang): QuickSearch[] {
	if (!canSearch(viewer)) return [];

	const t = lang.common;
	const searches: QuickSearch[] = [];

	if (!viewer.isGuest) {
		searches.push({ href: 'search.php?action=show_replies', label: t.postedTopics, title: t.showPostedTopics });
		searches.push({ href: 'search.php?action=show_new', label: t.newPostsHeader, title: t.showNewPosts });
	}

	searches.push({ href: 'search.php?action=show_recent', label: t.activeTopics, title: t.showActiveTopics });
	searches.push({ href: 'search.php?action=show_unanswered', label: t.unansweredTopics, title: t.showUnansweredTopics });

	return searches;
}

/**
 * Liens de flux de footer.php (et <link rel="alternate"> de l'en-tête) : forum et discussion. AvroBB
 * ne propose plus le flux des discussions actives à l'accueil (extern.php le sert toujours).
 */
function buildFeed(footer: FooterContext, config: BoardConfig, lang: Lang): FeedLink | null {
	if (config.feedType === 'none' || footer.kind === 'default' || footer.kind === 'index') return null;

	const t = lang.common;
	const forum = footer.kind === 'viewforum';
	return {
		href: `extern.php?action=feed${forum ? `&fid=${footer.forum.id}` : `&tid=${footer.topic.id}`}&type=rss`,
		label: forum ? t.rssForumFeed : t.rssTopicFeed,
		mimeType: 'application/rss+xml',
		cssClass: 'rss',
	};
}

/** Lien de modération du pied de page ; `post` : action qui écrit, envoyée par un formulaire POST. */
export interface ModControl {
	href: string;
	label: string;
	post: boolean;
}

/**
 * Liens de modération du pied de page (#modcontrols). Écart assumé : fermer ou épingler passe par un bouton POST avec
 * jeton CSRF (le PHP écrivait sur un lien GET, vérifié par le seul Referer).
 */
function buildModControls(footer: FooterContext, viewer: Viewer, lang: Lang): ModControl[] {
	const t = lang.common;

	if (footer.kind === 'viewforum' && isForumModerator(viewer, footer.forum))
		return [{ href: `moderate.php?fid=${footer.forum.id}&p=${footer.page}`, label: t.moderateForum, post: false }];

	if (footer.kind !== 'viewtopic' || !isForumModerator(viewer, footer.topic.forum)) return [];

	const { topic, page } = footer;
	const fid = topic.forum.id;

	return [
		{ href: `moderate.php?fid=${fid}&tid=${topic.id}&p=${page}`, label: t.moderateTopic, post: false },
		{ href: `moderate.php?fid=${fid}&move_topics=${topic.id}`, label: t.moveTopic, post: false },
		topic.closed
			? { href: `moderate.php?fid=${fid}&open=${topic.id}`, label: t.openTopic, post: true }
			: { href: `moderate.php?fid=${fid}&close=${topic.id}`, label: t.closeTopic, post: true },
		topic.sticky
			? { href: `moderate.php?fid=${fid}&unstick=${topic.id}`, label: t.unstickTopic, post: true }
			: { href: `moderate.php?fid=${fid}&stick=${topic.id}`, label: t.stickTopic, post: true },
	];
}

/**
 * Pied de page : termes et règles, confidentialité, aide (pages statiques d'AvroBB). La liste
 * « Atteindre » de FluxBB n'est pas reprise.
 */
function buildFooterLinks(lang: Lang, pageId: string): FooterLink[] {
	const t = lang.common;
	return [
		{ href: 'terms.php', label: t.footerTerms, active: pageId === 'terms' },
		{ href: 'privacy.php', label: t.footerPrivacy, active: pageId === 'privacy' },
		{ href: 'faq.php', label: t.footerHelp, active: pageId === 'faq' },
		{ href: 'stats.php', label: t.footerStats, active: pageId === 'stats' },
	];
}

export function buildLayout(input: LayoutInput): LayoutView {
	const { viewer, config, lang, options } = input;
	const footer = options.footer ?? { kind: 'default' };
	// Adresse canonique absolue (o_base_url) : les moteurs la préfèrent à une adresse relative.
	const canonical = options.canonicalUrl ? `${config.baseUrl}/${options.canonicalUrl}` : null;

	return {
		lang,
		pageId: options.pageId,
		pageTitle: pageTitle(options.titleParts, options.pageNumber ?? null, lang),
		boardTitle: config.boardTitle,
		// set_default_user() : un invité a toujours le thème par défaut du forum.
		theme: resolveTheme(viewer.isGuest ? config.defaultStyle : viewer.style, config.defaultStyle),
		robotsNoIndex: options.allowIndex !== true,
		canonicalUrl: canonical,
		meta: {
			description: options.description ?? plainExcerpt(config.boardDescription),
			title: options.titleParts.at(-1) ?? config.boardTitle,
			siteName: config.boardTitle,
			url: canonical,
			image: options.image ?? `${config.baseUrl}/${SHARE_IMAGE}`,
			type: options.shareType ?? 'website',
		},
		nav: buildNav(input),
		status: buildStatus(input),
		quickSearches: buildQuickSearches(viewer, lang),
		announcementHtml: viewer.group.canReadBoard ? config.announcement : null,
		feed: buildFeed(footer, config, lang),
		modControls: buildModControls(footer, viewer, lang),
		footerLinks: buildFooterLinks(lang, options.pageId),
		csrfToken: input.csrfToken,
		header: { logoHref: headerImageHref('logo', config.headerVersion), bannerHref: headerImageHref('banner', config.headerVersion) },
		memberSuggest: !viewer.isGuest && viewer.group.canViewUsers ? { profileBase: `${config.baseUrl}/profile.php?id=` } : null,
		// Bandeau pour les membres seulement : un invité banni par son adresse IP n'écrit déjà presque
		// rien (ses envois restent refusés), le message ne ferait que l'intriguer.
		ban:
			viewer.ban !== null && !viewer.isGuest
				? {
						expires:
							viewer.ban.expire !== null
								? formatTime(viewer.ban.expire, viewerTimeSettings(viewer), input.dateWords, input.now, true).toLowerCase()
								: null,
						reason: viewer.ban.message !== '' ? viewer.ban.message : null,
					}
				: null,
	};
}

/**
 * Mise en page de secours, sans base ni utilisateur : pour les erreurs survenues avant que la
 * requête soit authentifiée (base indisponible…).
 */
export function buildMinimalLayout(lang: Lang, title: string): LayoutView {
	return {
		lang,
		pageId: 'message',
		pageTitle: title,
		boardTitle: title,
		theme: 'Air',
		robotsNoIndex: true,
		canonicalUrl: null,
		meta: { description: null, title, siteName: title, url: null, image: SHARE_IMAGE, type: 'website' },
		nav: [link('navindex', 'index.php', lang.common.index, false)],
		status: null,
		quickSearches: [],
		announcementHtml: null,
		feed: null,
		modControls: [],
		footerLinks: buildFooterLinks(lang, 'message'),
		csrfToken: '',
		header: { logoHref: headerImageHref('logo', 0), bannerHref: headerImageHref('banner', 0) },
		memberSuggest: null,
		ban: null,
	};
}
