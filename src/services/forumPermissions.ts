/**
 * Permissions d'un groupe dans un forum (admin_forums.php?edit_forum=…) : valeurs affichées d'après
 * le groupe et la ligne forum_perms, écart avec les réglages du groupe, et décision d'enregistrement.
 * Règles reprises telles quelles du PHP.
 */

export interface GroupForumPermissionRow {
	groupId: number;
	title: string;
	/** Réglages du groupe (g_read_board, g_post_replies, g_post_topics). */
	groupReadBoard: boolean;
	groupPostReplies: boolean;
	groupPostTopics: boolean;
	/** Ligne forum_perms ; null si absente (réglages du groupe). */
	forum: { readForum: boolean; postReplies: boolean; postTopics: boolean } | null;
}

export interface EffectivePermission {
	readForum: boolean;
	postReplies: boolean;
	postTopics: boolean;
}

/** Permissions affichées dans le formulaire. */
export function effectivePermission(row: GroupForumPermissionRow): EffectivePermission {
	return {
		readForum: row.forum?.readForum ?? true,
		postReplies: row.forum?.postReplies ?? row.groupPostReplies,
		postTopics: row.forum?.postTopics ?? row.groupPostTopics,
	};
}

/** Cases qui diffèrent des réglages du groupe (mises en évidence, class="nodefault" du PHP). */
export function differsFromGroup(row: GroupForumPermissionRow): EffectivePermission {
	const current = effectivePermission(row);
	return {
		readForum: !current.readForum,
		postReplies: current.postReplies !== row.groupPostReplies,
		postTopics: current.postTopics !== row.groupPostTopics,
	};
}

export type PermissionChange = { kind: 'unchanged' } | { kind: 'default' } | { kind: 'set'; permission: EffectivePermission };

/**
 * Décision pour un groupe après envoi du formulaire. Comme le PHP : la lecture ne se modifie que si
 * le groupe peut lire le forum ; des réglages identiques à ceux du groupe suppriment la ligne.
 * `old` est la valeur affichée à l'ouverture du formulaire (champs *_old), `sent` les cases cochées.
 */
export function permissionChange(row: GroupForumPermissionRow, old: EffectivePermission, sent: EffectivePermission): PermissionChange {
	const next: EffectivePermission = {
		readForum: row.groupReadBoard ? sent.readForum : old.readForum,
		postReplies: sent.postReplies,
		postTopics: sent.postTopics,
	};
	if (next.readForum === old.readForum && next.postReplies === old.postReplies && next.postTopics === old.postTopics)
		return { kind: 'unchanged' };
	if (next.readForum && next.postReplies === row.groupPostReplies && next.postTopics === row.groupPostTopics) return { kind: 'default' };
	return { kind: 'set', permission: next };
}
