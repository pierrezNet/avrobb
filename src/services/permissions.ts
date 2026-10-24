/**
 * Règles d'accès, regroupées ici au lieu d'être répétées dans les pages
 * (viewtopic.php les recopiait en trois endroits, header.php et les mods en ajoutaient d'autres).
 */

import { type BoardConfig, type ForumInfo, GroupId, type PostingTarget, type Topic, type Viewer } from '../domain/models.ts';

export function isAdmin(viewer: Viewer): boolean {
	return viewer.group.id === GroupId.Admin;
}

/** Administrateur, ou modérateur de groupe désigné sur ce forum ($is_admmod de viewforum/viewtopic). */
export function isForumModerator(viewer: Viewer, forum: { moderators: ReadonlyMap<string, number> }): boolean {
	return isAdmin(viewer) || (viewer.group.isModerator && forum.moderators.has(viewer.username));
}

/** Lien « Nouvelle discussion » de viewforum.php. */
export function canPostTopic(viewer: Viewer, forum: ForumInfo): boolean {
	return isForumModerator(viewer, forum) || (forum.topicPermission ?? viewer.group.canPostTopics);
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
	if (isForumModerator(viewer, topic.forum)) return true;

	return !topic.closed && hasReplyPermission(viewer, topic);
}

/**
 * Droit d'écrire dans post.php : modérateur du forum, sinon permission du forum (ou du groupe) de
 * répondre ou de créer une discussion, et sujet ouvert.
 */
export function canPostIn(viewer: Viewer, target: PostingTarget): boolean {
	if (isForumModerator(viewer, target.forum)) return true;
	if (target.topic === null) return target.topicPermission ?? viewer.group.canPostTopics;
	return !target.topic.closed && (target.replyPermission ?? viewer.group.canPostReplies);
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
export function postActions(viewer: Viewer, topic: Topic, posterId: number, position: number, posterIsAdmin: boolean): PostActionRights {
	if (isForumModerator(viewer, topic.forum)) {
		const canModify = isAdmin(viewer) || !posterIsAdmin;
		return { report: true, delete: canModify, edit: canModify, quote: true };
	}

	const rights: PostActionRights = { report: !viewer.isGuest, delete: false, edit: false, quote: false };

	if (topic.closed) return rights;

	if (!viewer.isGuest && posterId === viewer.id) {
		rights.delete = position === 1 ? viewer.group.canDeleteTopics : viewer.group.canDeletePosts;
		rights.edit = viewer.group.canEditPosts;
	}

	rights.quote = hasReplyPermission(viewer, topic);

	return rights;
}

/** Messagerie privée disponible pour ce membre (conditions de plugins/apms/header_add1.php). */
export function canUsePrivateMessages(viewer: Viewer, config: BoardConfig): boolean {
	return !viewer.isGuest && config.privateMessagesEnabled && viewer.group.canUsePrivateMessages && viewer.usesPrivateMessages;
}

/** Recherche accessible au groupe (g_read_board et g_search). */
export function canSearch(viewer: Viewer): boolean {
	return viewer.group.canReadBoard && viewer.group.canSearch;
}

/**
 * Renommée affichée sous un auteur (include/reputation/rep_viewtopic.php). Le PHP teste aussi
 * $pun_user['reputation_enable_adm'], colonne absente du schéma connu : considérée comme activée.
 */
export function canSeeReputation(viewer: Viewer, config: BoardConfig, author: { reputationEnabled: boolean }): boolean {
	return config.reputationEnabled && viewer.group.canUseReputation && viewer.reputationEnabled && author.reputationEnabled;
}

/** Vote de renommée : ni les invités, ni l'auteur lui-même (comparaison des pseudos, comme le PHP). */
export function canVoteReputation(viewer: Viewer, authorUsername: string): boolean {
	return !viewer.isGuest && viewer.username !== authorUsername;
}

/**
 * Le lecteur peut-il modifier ce profil ? (condition « View or edit? » de profile.php) : le sien,
 * ou en administrateur, ou en modérateur autorisé (g_mod_edit_users) sur un membre qui n'est ni
 * administrateur ni modérateur.
 */
export function canEditProfile(viewer: Viewer, target: { id: number; groupId: number; groupIsModerator: boolean }): boolean {
	if (!viewer.isGuest && viewer.id === target.id) return true;
	if (!isAnyModerator(viewer)) return false;
	if (isAdmin(viewer)) return true;
	return viewer.group.canModEditUsers && target.groupId !== GroupId.Admin && !target.groupIsModerator;
}
