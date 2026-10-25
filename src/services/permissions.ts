/**
 * Règles d'accès, regroupées ici au lieu d'être répétées dans les pages
 * (viewtopic.php les recopiait en trois endroits, header.php et les mods en ajoutaient d'autres).
 */

import {
	type BoardConfig,
	type EditablePost,
	type ForumInfo,
	GroupId,
	type PostingTarget,
	type Topic,
	type Viewer,
} from '../domain/models.ts';

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

/**
 * Réponse rapide sous viewtopic (o_quickpost) : permission de répondre du forum ou du groupe, et
 * sujet ouvert sauf pour un modérateur. Contrairement au lien « Répondre », un modérateur n'y a pas
 * accès dans un forum où son groupe ne peut pas répondre (fidèle à viewtopic.php).
 */
export function canQuickPost(viewer: Viewer, topic: Topic, config: BoardConfig): boolean {
	return config.posting.quickpost && hasReplyPermission(viewer, topic) && (!topic.closed || isForumModerator(viewer, topic.forum));
}

/**
 * Délai pendant lequel un membre peut modifier son message (edit.php de PV : 30 minutes). Écart
 * assumé : PV comparait strtotime(<timestamp>), toujours faux, si bien que seuls les modérateurs
 * pouvaient modifier ; on applique la règle voulue, à partir de l'heure du message lui-même.
 */
export const EDIT_WINDOW_SECONDS = 1800;

/** Ce qu'il faut savoir d'un message pour décider qui peut le modifier ou le supprimer. */
export interface PostOwnership {
	posterId: number;
	posterIsAdmin: boolean;
	posted: number;
	isTopicPost: boolean;
	topic: { closed: boolean };
	forum: { moderators: ReadonlyMap<string, number> };
}

/** Droits sur un message lu par edit.php ou delete.php. */
export function ownershipOf(post: EditablePost): PostOwnership {
	return { ...post, isTopicPost: post.id === post.topic.firstPostId };
}

/** Modérateur du forum, sauf sur le message d'un administrateur s'il ne l'est pas lui-même. */
function moderates(viewer: Viewer, post: PostOwnership): boolean | null {
	if (!isForumModerator(viewer, post.forum)) return null;
	return isAdmin(viewer) || !post.posterIsAdmin;
}

const ownsOpenPost = (viewer: Viewer, post: PostOwnership): boolean => !viewer.isGuest && post.posterId === viewer.id && !post.topic.closed;

/** edit.php */
export function canEditPost(viewer: Viewer, post: PostOwnership, now: number): boolean {
	return moderates(viewer, post) ?? (ownsOpenPost(viewer, post) && viewer.group.canEditPosts && now - post.posted <= EDIT_WINDOW_SECONDS);
}

/** delete.php : supprimer le premier message supprime la discussion (g_delete_topics en plus). */
export function canDeletePost(viewer: Viewer, post: PostOwnership): boolean {
	return (
		moderates(viewer, post) ??
		(ownsOpenPost(viewer, post) && viewer.group.canDeletePosts && (!post.isTopicPost || viewer.group.canDeleteTopics))
	);
}

export interface PostActionRights {
	report: boolean;
	delete: boolean;
	edit: boolean;
	quote: boolean;
}

/** Actions proposées sous un message de viewtopic. */
export function postActions(viewer: Viewer, topic: Topic, post: Omit<PostOwnership, 'topic' | 'forum'>, now: number): PostActionRights {
	const ownership: PostOwnership = { ...post, topic, forum: topic.forum };
	const moderator = isForumModerator(viewer, topic.forum);
	return {
		report: moderator || !viewer.isGuest,
		delete: canDeletePost(viewer, ownership),
		edit: canEditPost(viewer, ownership, now),
		quote: moderator || (!topic.closed && hasReplyPermission(viewer, topic)),
	};
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

/** Membre visé par une action de profile.php. */
export interface ProfileTarget {
	id: number;
	groupId: number;
	groupIsModerator: boolean;
}

/** Un modérateur de groupe peut-il agir sur ce membre ? Ni administrateur, ni autre modérateur. */
const moderatesMember = (viewer: Viewer, target: ProfileTarget): boolean =>
	viewer.group.isModerator && viewer.group.canModEditUsers && target.groupId !== GroupId.Admin && !target.groupIsModerator;

/** profile.php?action=change_email : soi-même, un administrateur, ou un modérateur autorisé. */
export function canChangeEmail(viewer: Viewer, target: ProfileTarget): boolean {
	if (!viewer.isGuest && viewer.id === target.id) return true;
	return isAdmin(viewer) || moderatesMember(viewer, target);
}

/** profile.php?action=change_pass : comme l'adresse, avec g_mod_change_passwords pour un modérateur. */
export function canChangePassword(viewer: Viewer, target: ProfileTarget): boolean {
	if (!viewer.isGuest && viewer.id === target.id) return true;
	return isAdmin(viewer) || (moderatesMember(viewer, target) && viewer.group.canModChangePasswords);
}

/** Renommer un membre (champ « Nom d'utilisateur » de la section Principal). */
export function canRenameUsers(viewer: Viewer): boolean {
	return isAdmin(viewer) || (viewer.group.isModerator && viewer.group.canModRenameUsers);
}

/** Lien « Administration » du menu du profil (generate_profile_menu()). */
export function canSeeProfileAdmin(viewer: Viewer): boolean {
	return isAdmin(viewer) || (viewer.group.isModerator && viewer.group.canModBanUsers);
}

/** Plugiles privés (UPP_*) : « visibles par le membre et les administrateurs ». */
export function canUsePrivatePlugiles(viewer: Viewer, targetId: number): boolean {
	return (!viewer.isGuest && viewer.id === targetId) || isAdmin(viewer);
}
