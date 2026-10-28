/**
 * Modèles de vue d'admin_users.php : formulaire de recherche, adresses IP d'un membre, membres
 * d'une adresse, résultats de recherche. Fonctions pures.
 */

import type { Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import type { AdminUserRow, IpPoster, IpStat } from '../repositories/UserAdminRepository.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import { forumNumberFormat } from '../services/numberFormat.ts';
import { USER_SEARCH_DATES, USER_SEARCH_FIELDS, USER_SEARCH_ORDERS } from '../services/userSearch.ts';
import { userTitle } from '../services/userTitle.ts';
import { type PaginationLink, paginationLinks } from './navigation.ts';

/** Groupe des comptes non validés (PUN_UNVERIFIED). */
const UNVERIFIED = 0;

export interface AdminUserSearchFormView {
	fields: { name: string; label: string }[];
	dates: { name: string; label: string }[];
	orders: { value: string; label: string }[];
	groups: { value: number; label: string }[];
}

export function buildUserSearchForm(groups: readonly { id: number; title: string }[], lang: Lang): AdminUserSearchFormView {
	const t = lang.adminUsers;
	return {
		fields: USER_SEARCH_FIELDS.map((name) => ({ name: `form[${name}]`, label: t.fields[name] ?? name })),
		dates: USER_SEARCH_DATES.map((name) => ({ name, label: t.dates[name] ?? name })),
		orders: USER_SEARCH_ORDERS.map((value) => ({ value, label: t.orderByOptions[value] ?? value })),
		groups: [
			{ value: -1, label: t.allGroups },
			{ value: UNVERIFIED, label: t.unverifiedUsers },
			...groups.filter((group) => group.id !== 3).map((group) => ({ value: group.id, label: group.title })),
		],
	};
}

export interface AdminUserRowView {
	id: number;
	username: string;
	profileHref: string;
	email: string;
	title: string;
	/** « Non vérifié » mis en évidence. */
	unverified: boolean;
	posts: string;
	adminNote: string;
	ipStatsHref: string;
	postsHref: string;
}

function userRow(user: AdminUserRow, bannedUsernames: ReadonlySet<string>, lang: Lang): AdminUserRowView {
	const t = lang.adminUsers;
	const title = userTitle(
		{ username: user.username, title: user.title, groupId: user.groupId ?? UNVERIFIED, groupUserTitle: user.groupUserTitle },
		bannedUsernames,
		{ banned: lang.common.banned, guest: lang.common.guest, member: lang.common.member },
	);
	// Cas propre à admin_users.php : « Non vérifié » pour les comptes sans groupe valide.
	const unverified = (user.groupId === null || user.groupId === UNVERIFIED) && title !== lang.common.banned;
	return {
		id: user.id,
		username: user.username,
		profileHref: `profile.php?id=${user.id}`,
		email: user.email,
		title: unverified ? t.notVerified : title,
		unverified,
		posts: forumNumberFormat(user.numPosts),
		adminNote: user.adminNote,
		ipStatsHref: `admin_users.php?ip_stats=${user.id}`,
		postsHref: `search.php?action=show_user_posts&user_id=${user.id}`,
	};
}

export interface AdminIpStatsView {
	rows: { ip: string; hostHref: string; lastUsed: string; timesFound: number; moreHref: string }[];
	pagination: PaginationLink[];
}

export function buildIpStats(input: {
	userId: number;
	stats: readonly IpStat[];
	page: number;
	numPages: number;
	viewer: Viewer;
	dateWords: DateWords;
	now: number;
}): AdminIpStatsView {
	return {
		rows: input.stats.map((stat) => ({
			ip: stat.ip,
			hostHref: `moderate.php?get_host=${encodeURIComponent(stat.ip)}`,
			lastUsed: formatTime(stat.lastUsed, viewerTimeSettings(input.viewer), input.dateWords, input.now),
			timesFound: stat.timesFound,
			moreHref: `admin_users.php?show_users=${encodeURIComponent(stat.ip)}`,
		})),
		pagination: paginationLinks(
			input.numPages,
			input.page,
			(page) => `admin_users.php?ip_stats=${input.userId}${page > 1 ? `&p=${page}` : ''}`,
		),
	};
}

export interface AdminUserListView {
	rows: ({ guest: false; user: AdminUserRowView } | { guest: true; poster: string })[];
	pagination: PaginationLink[];
	emptyText: string;
}

export function buildIpPosters(input: {
	ip: string;
	posters: readonly IpPoster[];
	page: number;
	numPages: number;
	bannedUsernames: ReadonlySet<string>;
	lang: Lang;
}): AdminUserListView {
	return {
		rows: input.posters.map((poster) =>
			poster.user !== null
				? { guest: false as const, user: userRow(poster.user, input.bannedUsernames, input.lang) }
				: { guest: true as const, poster: poster.poster },
		),
		pagination: paginationLinks(input.numPages, input.page, (page) => {
			const query = new URLSearchParams({ show_users: input.ip });
			if (page > 1) query.set('p', String(page));
			return `admin_users.php?${query.toString()}`;
		}),
		emptyText: input.lang.adminUsers.noIpFound,
	};
}

export function buildUserResults(input: {
	users: readonly AdminUserRow[];
	queryString: string;
	page: number;
	numPages: number;
	bannedUsernames: ReadonlySet<string>;
	lang: Lang;
}): AdminUserListView {
	return {
		rows: input.users.map((user) => ({ guest: false as const, user: userRow(user, input.bannedUsernames, input.lang) })),
		pagination: paginationLinks(
			input.numPages,
			input.page,
			(page) => `admin_users.php?${input.queryString}${page > 1 ? `&p=${page}` : ''}`,
		),
		emptyText: input.lang.adminUsers.noMatch,
	};
}
