/**
 * Modèle de vue de userlist.php : formulaire de recherche et liste paginée des membres. Fonction pure.
 */

import type { GroupSummary, MemberSort, MemberSummary, Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import { forumNumberFormat } from '../services/numberFormat.ts';
import { userTitle } from '../services/userTitle.ts';
import { type PaginationLink, paginationLinks } from './navigation.ts';

/** Critères de la liste, déjà validés par le contrôleur. */
export interface UserlistQuery {
	username: string;
	/** -1 pour tous les groupes. */
	showGroup: number;
	sortBy: MemberSort;
	sortDir: 'ASC' | 'DESC';
}

export interface UserlistPageView {
	form: {
		/** Champ pseudo : seulement si le groupe peut chercher des membres (g_search_users). */
		showUsername: boolean;
		username: string;
		groups: { id: number; title: string; selected: boolean }[];
		allGroupsSelected: boolean;
		sorts: { value: MemberSort; label: string; selected: boolean }[];
		descending: boolean;
		help: string;
	};
	showPostCount: boolean;
	members: { id: number; username: string; href: string; title: string; numPosts: string; registered: string }[];
	pagination: PaginationLink[];
}

export interface UserlistPageInput {
	viewer: Viewer;
	query: UserlistQuery;
	showPostCount: boolean;
	members: readonly MemberSummary[];
	groups: readonly GroupSummary[];
	bannedUsernames: ReadonlySet<string>;
	page: number;
	numPages: number;
	lang: Lang;
	dateWords: DateWords;
	now: number;
}

/** URL d'une page de la liste avec les mêmes critères (comme les liens de paginate() du PHP). */
export function userlistUrl(query: UserlistQuery, page: number): string {
	const params = new URLSearchParams({
		username: query.username,
		show_group: String(query.showGroup),
		sort_by: query.sortBy,
		sort_dir: query.sortDir,
	});
	if (page > 1) params.set('p', String(page));
	return `userlist.php?${params.toString()}`;
}

export function buildUserlistPage(input: UserlistPageInput): UserlistPageView {
	const { viewer, query, lang } = input;
	const t = lang.userlist;
	const time = viewerTimeSettings(viewer);
	const words = { banned: lang.common.banned, guest: lang.common.guest, member: lang.common.member };
	const sorts: { value: MemberSort; label: string }[] = [
		{ value: 'username', label: t.username },
		{ value: 'registered', label: t.registered },
		...(input.showPostCount ? [{ value: 'num_posts' as const, label: t.numPosts }] : []),
	];

	return {
		form: {
			showUsername: viewer.group.canSearchUsers,
			username: query.username,
			groups: input.groups.map((group) => ({ id: group.id, title: group.title, selected: group.id === query.showGroup })),
			allGroupsSelected: query.showGroup === -1,
			sorts: sorts.map((sort) => ({ ...sort, selected: sort.value === query.sortBy })),
			descending: query.sortDir === 'DESC',
			help: viewer.group.canSearchUsers ? `${t.userSearchInfo} ${t.userSortInfo}` : t.userSortInfo,
		},
		showPostCount: input.showPostCount,
		members: input.members.map((member) => ({
			id: member.id,
			username: member.username,
			href: `profile.php?id=${member.id}`,
			title: userTitle(member, input.bannedUsernames, words),
			numPosts: forumNumberFormat(member.numPosts),
			registered: formatTime(member.registered, time, input.dateWords, input.now, true),
		})),
		pagination: paginationLinks(input.numPages, input.page, (page) => userlistUrl(query, page)),
	};
}
