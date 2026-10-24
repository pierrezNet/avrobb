/**
 * Construction du modèle de vue de viewtopic à partir des objets du domaine.
 *
 * Fonction pure : aucune requête, aucun accès HTTP. Toute la logique d'affichage est ici,
 * sur des données déjà chargées ; la vue ne fait que du balisage. Les dates sont formatées
 * en dernier, et seulement pour l'affichage (pas de comparaison sur des chaînes formatées).
 */

import { GroupId, type BoardConfig, type Post, type Topic, type Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr.ts';
import { parseBbcode } from '../services/bbcode.ts';
import { formatTime, type DateWords, type TimeSettings } from '../services/dateFormat.ts';
import { paginate, type PageLink } from '../services/pagination.ts';
import { canReply, isAnyModerator, postActions, type PostActionRights } from '../services/permissions.ts';

export interface PostView {
	id: number;
	number: number;
	isFirstPost: boolean;
	rowClass: 'rowodd' | 'roweven';
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
	ip: string | null;
	adminNote: string | null;
	isOnline: boolean | null;
	/** HTML produit par parseBbcode (échappé par construction). */
	messageHtml: string;
	signatureHtml: string | null;
	edited: { by: string; at: string } | null;
	actions: PostActionRights;
}

export interface TopicPageView {
	topic: { id: number; subject: string; closed: boolean };
	forum: { id: number; name: string };
	page: number;
	pagination: PageLink[];
	canReply: boolean;
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
	if (post.author === null)
		return lang.guest;
	if (post.author.title !== '')
		return post.author.title;
	if (post.author.groupUserTitle !== '')
		return post.author.groupUserTitle;
	return lang.member;
}

export function buildTopicPage(input: TopicPageInput): TopicPageView {
	const { viewer, config, topic, lang } = input;
	const time: TimeSettings = {
		timezone: viewer.timezone,
		dst: viewer.dst,
		dateFormat: config.dateFormat,
		timeFormat: config.timeFormat,
	};
	const format = (ts: number | null, dateOnly = false): string =>
		formatTime(ts, time, input.dateWords, input.now, dateOnly);

	const viewerIsMod = isAnyModerator(viewer);
	const showSignatures = config.signatures && viewer.showSignatures;

	const posts = input.posts.map((post, index): PostView => {
		const position = input.firstPosition + index;
		const author = post.author;
		const showInfo = author !== null && config.showUserInfo;

		let emailUrl: string | null = null;
		if (config.showUserInfo && viewer.group.canSendEmail) {
			if (author !== null) {
				if ((author.emailSetting === 0 && !viewer.isGuest) || viewerIsMod)
					emailUrl = `mailto:${author.email}`;
				else if (author.emailSetting === 1 && !viewer.isGuest)
					emailUrl = `misc.php?email=${author.id}`;
			}
			else if (post.posterEmail !== '' && !viewer.isGuest) {
				emailUrl = `mailto:${post.posterEmail}`;
			}
		}

		return {
			id: post.id,
			number: position,
			isFirstPost: post.id === topic.firstPostId,
			rowClass: index % 2 === 0 ? 'rowodd' : 'roweven',
			postedAt: format(post.posted),
			username: post.username,
			profileUrl: author !== null && viewer.group.canViewUsers ? `profile.php?id=${author.id}` : null,
			userTitle: userTitle(post, lang),
			avatarUrl: author !== null ? input.avatars.get(author.id) ?? null : null,
			location: showInfo && author.location !== '' ? author.location : null,
			registeredAt: showInfo ? format(author.registered, true) : null,
			numPosts: showInfo && (config.showPostCount || viewerIsMod) ? author.numPosts : null,
			emailUrl,
			websiteUrl: showInfo && author.url !== '' ? author.url : null,
			ip: viewerIsMod ? post.posterIp : null,
			adminNote: viewerIsMod && author !== null && author.adminNote !== '' ? author.adminNote : null,
			isOnline: author !== null ? author.isOnline : null,
			messageHtml: parseBbcode(post.message, { bbcode: config.bbcode, showImages: config.imgTag }),
			signatureHtml: showSignatures && author !== null && author.signature !== ''
				? parseBbcode(author.signature, { bbcode: config.bbcode, showImages: config.imgTag })
				: null,
			edited: post.edited !== null ? { by: post.editedBy, at: format(post.edited) } : null,
			actions: postActions(viewer, topic, author?.id ?? 0, position, author?.groupId === GroupId.Admin),
		};
	});

	return {
		topic: { id: topic.id, subject: topic.subject, closed: topic.closed },
		forum: { id: topic.forum.id, name: topic.forum.name },
		page: input.page,
		pagination: paginate(input.numPages, input.page),
		canReply: canReply(viewer, topic),
		posts,
	};
}
