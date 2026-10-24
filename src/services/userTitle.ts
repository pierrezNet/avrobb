/**
 * Titre affiché sous le pseudo : get_title() de include/functions.php. FluxBB 1.5 n'a plus de rangs :
 * titre personnel, sinon « banni » (« En vacances » chez PV), sinon titre du groupe, sinon
 * Invité ou Membre.
 */

import { GroupId } from '../domain/models.ts';

export interface TitledUser {
	username: string;
	/** users.title (vide si aucun). */
	title: string;
	groupId: number;
	/** groups.g_user_title (vide si aucun). */
	groupUserTitle: string;
}

export interface TitleWords {
	banned: string;
	guest: string;
	member: string;
}

/** @param bannedUsernames pseudos bannis, en minuscules */
export function userTitle(user: TitledUser, bannedUsernames: ReadonlySet<string>, words: TitleWords): string {
	if (user.title !== '') return user.title;
	if (bannedUsernames.has(user.username.toLowerCase())) return words.banned;
	if (user.groupUserTitle !== '') return user.groupUserTitle;
	if (user.groupId === GroupId.Guest) return words.guest;
	return words.member;
}
