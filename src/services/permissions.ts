/**
 * Règles d'accès de viewtopic, regroupées ici au lieu d'être répétées dans la page
 * (viewtopic.php les recopiait en trois endroits).
 */

import { GroupId, type Topic, type Viewer } from '../domain/models.ts';

export function isAdmin(viewer: Viewer): boolean {
	return viewer.group.id === GroupId.Admin;
}

/** Administrateur, ou modérateur de groupe désigné sur le forum de ce sujet. */
export function isForumModerator(viewer: Viewer, topic: Topic): boolean {
	return isAdmin(viewer)
		|| (viewer.group.isModerator && topic.forum.moderators.has(viewer.username));
}

/** Administrateur ou membre d'un groupe modérateur, quel que soit le forum ($pun_user['is_admmod']). */
export function isAnyModerator(viewer: Viewer): boolean {
	return isAdmin(viewer) || viewer.group.isModerator;
}

/** Le groupe peut-il répondre dans ce forum, en ignorant la fermeture du sujet ? */
function hasReplyPermission(viewer: Viewer, topic: Topic): boolean {
	return topic.forumReplyPermission ?? viewer.group.canPostReplies;
}

export function canReply(viewer: Viewer, topic: Topic): boolean {
	if (isForumModerator(viewer, topic))
		return true;

	return !topic.closed && hasReplyPermission(viewer, topic);
}

export interface PostActionRights {
	report: boolean;
	delete: boolean;
	edit: boolean;
	quote: boolean;
}

/**
 * Actions proposées sous un message.
 * @param position rang du message dans le sujet (1 = message d'ouverture)
 * @param posterIsAdmin l'auteur est-il administrateur (un modérateur ne peut pas toucher à ses messages)
 */
export function postActions(
	viewer: Viewer,
	topic: Topic,
	posterId: number,
	position: number,
	posterIsAdmin: boolean,
): PostActionRights {
	if (isForumModerator(viewer, topic)) {
		const canModify = isAdmin(viewer) || !posterIsAdmin;
		return { report: true, delete: canModify, edit: canModify, quote: true };
	}

	const rights: PostActionRights = { report: !viewer.isGuest, delete: false, edit: false, quote: false };

	if (topic.closed)
		return rights;

	if (!viewer.isGuest && posterId === viewer.id) {
		rights.delete = position === 1 ? viewer.group.canDeleteTopics : viewer.group.canDeletePosts;
		rights.edit = viewer.group.canEditPosts;
	}

	rights.quote = hasReplyPermission(viewer, topic);

	return rights;
}
