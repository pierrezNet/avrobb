/**
 * Construction du modèle de vue de viewtopic à partir des objets du domaine.
 *
 * Fonction pure : aucune requête, aucun accès HTTP. Toute la logique d'affichage est ici,
 * sur des données déjà chargées ; la vue ne fait que du balisage. Les dates sont formatées
 * en dernier, et seulement pour l'affichage (pas de comparaison sur des chaînes formatées).
 */

import { type BoardConfig, GroupId, type Post, type Topic, type Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { parseBbcode } from '../services/bbcode.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import { canReply, isAnyModerator, type PostActionRights, postActions } from '../services/permissions.ts';
import { type Crumb, crumbs, type PaginationLink, paginationLinks } from './navigation.ts';

/** Lien d'action sous un message ; `kind` sert aussi de classe CSS (postreport…, comme FluxBB). */
export interface PostAction {
	kind: 'postreport' | 'postdelete' | 'postedit' | 'postquote';
	href: string;
	label: string;
}

export interface PostView {
	id: number;
	number: number;
	isFirstPost: boolean;
	permalink: string;
	postedAt: string;
	username: string;
	profileUrl: string | null;
	userTitle: string;
	avatarUrl: string | null;
	location: string | null;
	registeredAt: string | null;
	numPosts: number | null;
	emailUrl: string | null;
	websiteUrl: string | null;
	/** IP de l'auteur (modérateurs seulement) et lien vers sa résolution. */
	ip: { address: string; href: string } | null;
	adminNote: string | null;
	isOnline: boolean | null;
	/** HTML produit par parseBbcode (échappé par construction). */
	messageHtml: string;
	signatureHtml: string | null;
	edited: { by: string; at: string } | null;
	actions: PostAction[];
}

export interface TopicPageView {
	topic: { id: number; subject: string; closed: boolean };
	crumbs: Crumb[];
	pagination: PaginationLink[];
	/** Lien « Répondre » ; null si le membre ne peut pas répondre. */
	replyUrl: string | null;
	posts: PostView[];
}

export interface TopicPageInput {
	viewer: Viewer;
	config: BoardConfig;
	topic: Topic;
	posts: readonly Post[];
	page: number;
	numPages: number;
	/** Rang (dans le sujet) du premier message de la page, à partir de 1. */
	firstPosition: number;
	avatars: ReadonlyMap<number, string | null>;
	lang: Lang;
	dateWords: DateWords;
	now: number;
}

/** Titre affiché sous le nom (get_title() de FluxBB, sans les rangs ni les bannissements). */
function userTitle(post: Post, lang: Lang): string {
	if (post.author === null) return lang.common.guest;
	if (post.author.title !== '') return post.author.title;
	if (post.author.groupUserTitle !== '') return post.author.groupUserTitle;
	return lang.common.member;
}

function actionLinks(rights: PostActionRights, postId: number, topicId: number, lang: Lang): PostAction[] {
	const t = lang.topic;
	const links: PostAction[] = [];
	if (rights.report) links.push({ kind: 'postreport', href: `misc.php?report=${postId}`, label: t.report });
	if (rights.delete) links.push({ kind: 'postdelete', href: `delete.php?id=${postId}`, label: t.delete });
	if (rights.edit) links.push({ kind: 'postedit', href: `edit.php?id=${postId}`, label: t.edit });
	if (rights.quote) links.push({ kind: 'postquote', href: `post.php?tid=${topicId}&qid=${postId}`, label: t.quote });
	return links;
}

/** URL d'une page du sujet (la page 1 n'a pas de paramètre p, comme dans FluxBB). */
export function topicUrl(topicId: number, page = 1): string {
	return page > 1 ? `viewtopic.php?id=${topicId}&p=${page}` : `viewtopic.php?id=${topicId}`;
}

export function buildTopicPage(input: TopicPageInput): TopicPageView {
	const { viewer, config, topic, lang } = input;
	const time = viewerTimeSettings(viewer);
	const format = (ts: number | null, dateOnly = false): string => formatTime(ts, time, input.dateWords, input.now, dateOnly);

	const viewerIsMod = isAnyModerator(viewer);
	const showSignatures = config.signatures && viewer.showSignatures;

	const posts = input.posts.map((post, index): PostView => {
		const position = input.firstPosition + index;
		const author = post.author;
		const showInfo = author !== null && config.showUserInfo;

		let emailUrl: string | null = null;
		if (config.showUserInfo && viewer.group.canSendEmail) {
			if (author !== null) {
				if ((author.emailSetting === 0 && !viewer.isGuest) || viewerIsMod) emailUrl = `mailto:${author.email}`;
				else if (author.emailSetting === 1 && !viewer.isGuest) emailUrl = `misc.php?email=${author.id}`;
			} else if (post.posterEmail !== '' && !viewer.isGuest) {
				emailUrl = `mailto:${post.posterEmail}`;
			}
		}

		return {
			id: post.id,
			number: position,
			isFirstPost: post.id === topic.firstPostId,
			permalink: `viewtopic.php?pid=${post.id}#p${post.id}`,
			postedAt: format(post.posted),
			username: post.username,
			profileUrl: author !== null && viewer.group.canViewUsers ? `profile.php?id=${author.id}` : null,
			userTitle: userTitle(post, lang),
			avatarUrl: author !== null ? (input.avatars.get(author.id) ?? null) : null,
			location: showInfo && author.location !== '' ? author.location : null,
			registeredAt: showInfo ? format(author.registered, true) : null,
			numPosts: showInfo && (config.showPostCount || viewerIsMod) ? author.numPosts : null,
			emailUrl,
			websiteUrl: showInfo && author.url !== '' ? author.url : null,
			ip: viewerIsMod ? { address: post.posterIp, href: `moderate.php?get_host=${post.id}` } : null,
			adminNote: viewerIsMod && author !== null && author.adminNote !== '' ? author.adminNote : null,
			isOnline: author !== null ? author.isOnline : null,
			messageHtml: parseBbcode(post.message, { bbcode: config.bbcode, showImages: config.imgTag }),
			signatureHtml:
				showSignatures && author !== null && author.signature !== ''
					? parseBbcode(author.signature, { bbcode: config.bbcode, showImages: config.imgTag })
					: null,
			edited: post.edited !== null ? { by: post.editedBy, at: format(post.edited) } : null,
			actions: actionLinks(
				postActions(viewer, topic, author?.id ?? 0, position, author?.groupId === GroupId.Admin),
				post.id,
				topic.id,
				lang,
			),
		};
	});

	return {
		topic: { id: topic.id, subject: topic.subject, closed: topic.closed },
		crumbs: crumbs(
			{ label: lang.common.index, href: 'index.php' },
			{ label: topic.forum.name, href: `viewforum.php?id=${topic.forum.id}` },
			{ label: topic.subject, href: topicUrl(topic.id) },
		),
		pagination: paginationLinks(input.numPages, input.page, (page) => topicUrl(topic.id, page)),
		replyUrl: canReply(viewer, topic) ? `post.php?tid=${topic.id}` : null,
		posts,
	};
}
