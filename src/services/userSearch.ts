/**
 * Recherche d'utilisateurs de l'administration (admin_users.php?find_user) : lecture des critères,
 * dates converties comme strtotime() pour les formats proposés, et chaîne de requête des pages.
 */

/** Colonnes de users cherchables par motif (« * » joker), comme la liste blanche du PHP. */
export const USER_SEARCH_FIELDS = [
	'username',
	'email',
	'title',
	'realname',
	'url',
	'jabber',
	'icq',
	'msn',
	'aim',
	'yahoo',
	'location',
	'signature',
	'admin_note',
] as const;

export const USER_SEARCH_DATES = [
	'last_post_after',
	'last_post_before',
	'last_visit_after',
	'last_visit_before',
	'registered_after',
	'registered_before',
] as const;

export const USER_SEARCH_ORDERS = ['username', 'email', 'num_posts', 'last_post', 'last_visit', 'registered'] as const;

export type UserSearchField = (typeof USER_SEARCH_FIELDS)[number];
export type UserSearchDate = (typeof USER_SEARCH_DATES)[number];
export type UserSearchOrder = (typeof USER_SEARCH_ORDERS)[number];

export interface UserSearchCriteria {
	/** Motifs LIKE (« * » devenu « % »). */
	patterns: Partial<Record<UserSearchField, string>>;
	postsGreater: number | null;
	postsLess: number | null;
	/** Bornes exclusives (timestamps) sur last_post, last_visit et registered. */
	dates: Partial<Record<UserSearchDate, number>>;
	/** -1 : tous les groupes ; 0 : non vérifiés (PUN_UNVERIFIED). */
	group: number;
	orderBy: UserSearchOrder;
	descending: boolean;
}

export type UserSearchResult =
	| { kind: 'ok'; criteria: UserSearchCriteria; queryString: string }
	| { kind: 'nonNumeric' }
	| { kind: 'invalidDate' };

/**
 * Date saisie (heure locale du serveur, comme strtotime()) : aaaa-mm-jj ou jj-mm-aaaa (ou jj/mm/aaaa),
 * suivie éventuellement de hh:mm[:ss]. null si la date est invalide.
 */
export function parseAdminDate(value: string): number | null {
	const match = /^(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[-/](\d{1,2})[-/](\d{4}))(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
		value.trim(),
	);
	if (match === null) return null;
	const [, y1, m1, d1, d2, m2, y2, hh = '0', mm = '0', ss = '0'] = match;
	const year = Number(y1 ?? y2);
	const month = Number(m1 ?? m2);
	const day = Number(d1 ?? d2);
	const date = new Date(year, month - 1, day, Number(hh), Number(mm), Number(ss));
	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || Number(hh) > 23) return null;
	return Math.floor(date.getTime() / 1000);
}

/** Lit les critères depuis la requête (`read(name)`, chaîne vide si absent). */
export function readUserSearch(read: (name: string) => string): UserSearchResult {
	const query = new URLSearchParams();
	const orderValue = read('order_by');
	const orderBy = (USER_SEARCH_ORDERS as readonly string[]).includes(orderValue) ? (orderValue as UserSearchOrder) : 'username';
	const descending = read('direction') === 'DESC';
	const groupValue = read('user_group');
	const group = groupValue !== '' && /^-?\d+$/.test(groupValue.trim()) ? Number(groupValue) : -1;
	query.set('find_user', '');
	query.set('order_by', orderBy);
	query.set('direction', descending ? 'DESC' : 'ASC');
	query.set('user_group', String(group));

	const postsGreater = read('posts_greater').trim();
	const postsLess = read('posts_less').trim();
	if (/[^0-9]/.test(postsGreater + postsLess)) return { kind: 'nonNumeric' };

	const dates: UserSearchCriteria['dates'] = {};
	for (const name of USER_SEARCH_DATES) {
		const value = read(name).trim();
		if (value === '') continue;
		const timestamp = parseAdminDate(value);
		if (timestamp === null) return { kind: 'invalidDate' };
		dates[name] = timestamp;
		query.set(name, value);
	}

	const patterns: UserSearchCriteria['patterns'] = {};
	for (const name of USER_SEARCH_FIELDS) {
		const value = read(`form[${name}]`).trim();
		if (value === '') continue;
		patterns[name] = value.replaceAll('*', '%');
		query.set(`form[${name}]`, value);
	}
	if (postsGreater !== '') query.set('posts_greater', postsGreater);
	if (postsLess !== '') query.set('posts_less', postsLess);

	return {
		kind: 'ok',
		criteria: {
			patterns,
			postsGreater: postsGreater !== '' ? Number(postsGreater) : null,
			postsLess: postsLess !== '' ? Number(postsLess) : null,
			dates,
			group,
			orderBy,
			descending,
		},
		queryString: query.toString(),
	};
}
