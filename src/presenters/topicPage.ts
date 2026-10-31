/**
 * Construction du modèle de vue de viewtopic à partir des objets du domaine.
 *
 * Fonction pure : aucune requête, aucun accès HTTP. Toute la logique d'affichage est ici,
 * sur des données déjà chargées ; la vue ne fait que du balisage. Les dates sont formatées
 * en dernier, et seulement pour l'affichage (pas de comparaison sur des chaînes formatées).
 */

import { type BoardConfig, type FeedbackSourceId, GroupId, type Post, type PostAuthor, type Topic, type Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { type BbcodeOptions, parseMessage, parseSignature } from '../services/bbcode.ts';
import type { Censor } from '../services/censor.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import { safeExternalUrl } from '../services/links.ts';
import {
	acceptableAppFeedback,
	canEditSubjectPrefixes,
	canQuickPost,
	canReply,
	canSeeReputation,
	canUsePrivateMessages,
	canVoteReputation,
	isAnyModerator,
	type PostActionRights,
	postActions,
} from '../services/permissions.ts';
import { forumPath, topicPath } from '../services/routes.ts';
import { type SubjectSegment, subjectSegments } from '../services/subjectTags.ts';
import type { ToolbarSettings } from '../services/toolbar.ts';
import { userTitle } from '../services/userTitle.ts';
import { type Crumb, crumbs, type PaginationLink, paginationLinks } from './navigation.ts';
import { bbcodeLabels, messageParserOptions } from './parserOptions.ts';
import { type BbcodeStatus, bbcodeStatus, type ToolbarView, toolbarView } from './postPage.ts';

/** Lien d'action sous un message ; `kind` sert aussi de classe CSS (postreport…, comme FluxBB). */
export interface PostAction {
	kind: 'postreport' | 'postdelete' | 'postedit' | 'postquote';
	href: string;
	label: string;
}

/** Lien de contact sous l'auteur ; `abbrTitle` si `label` est une abréviation (« MP »). */
export interface ContactLink {
	kind: 'email' | 'pm' | 'website';
	href: string;
	label: string;
	abbrTitle: string | null;
	/** Lien externe saisi par le membre : rel="nofollow ugc". */
	external: boolean;
}

export interface ReputationView {
	href: string;
	score: number;
	/** Liens de vote ; null pour un invité ou pour l'auteur lui-même. */
	vote: { plusUrl: string; minusUrl: string } | null;
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
	contacts: ContactLink[];
	/** IP de l'auteur (modérateurs seulement) et lien vers sa résolution. */
	ip: { address: string; href: string } | null;
	adminNote: string | null;
	reputation: ReputationView | null;
	isOnline: boolean | null;
	/** HTML produit par parseMessage() (échappé par construction). */
	messageHtml: string;
	/** HTML produit par parseSignature() (échappé par construction). */
	signatureHtml: string | null;
	edited: { by: string; at: string } | null;
	actions: PostAction[];
}

export interface TopicPageView {
	/** `subject` : sujet affiché, censure comprise. */
	/** `subjectParts` : balises de tête en pastilles colorées (titre de la page). */
	topic: { id: number; subject: string; subjectParts: SubjectSegment[]; closed: boolean };
	crumbs: Crumb[];
	pagination: PaginationLink[];
	/** Lien « Répondre » ; null si le membre ne peut pas répondre ou si le formulaire de réponse est en bas de page. */
	replyUrl: string | null;
	/** Préfixes du sujet (PV) : auteur de la discussion et modérateurs. */
	prefixesUrl: string | null;
	posts: PostView[];
	/** Formulaire de réponse rapide, ou null. */
	quickPost: QuickPostView | null;
	/** Abonnement au sujet (membres, o_topic_subscriptions) : bouton POST vers misc.php. */
	subscription: { subscribed: boolean; action: string } | null;
	/** Retour d'une application source à trier : bouton POST « Accepter » (publication dans le forum public), ou null. */
	accept: { action: string; label: string } | null;
}

export interface QuickPostView {
	formAction: string;
	/** Champs d'un invité, comme dans post.php. */
	guest: { emailField: 'req_email' | 'email'; emailRequired: boolean } | null;
	/** Abonnement conservé (abonnement automatique ou déjà abonné) : champ caché « subscribe ». */
	keepSubscribed: boolean;
	bbcodeStatus: BbcodeStatus;
	toolbar: ToolbarView | null;
}

function quickPost(input: TopicPageInput): QuickPostView | null {
	const { viewer, config, topic, lang } = input;
	if (!canQuickPost(viewer, topic, config)) return null;
	return {
		formAction: `post.php?action=post&tid=${topic.id}`,
		guest: viewer.isGuest
			? { emailField: config.posting.forceGuestEmail ? 'req_email' : 'email', emailRequired: config.posting.forceGuestEmail }
			: null,
		keepSubscribed: !viewer.isGuest && config.topicSubscriptions && (viewer.autoNotify || topic.isSubscribed),
		bbcodeStatus: bbcodeStatus(config, viewer, lang),
		toolbar: toolbarView(input.toolbar, 'quickform', config, lang, !viewer.isGuest),
	};
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
	/** Pseudos bannis, en minuscules (pour get_title()). */
	bannedUsernames: ReadonlySet<string>;
	/** Censure (o_censoring), ou null si désactivée. */
	censor: Censor | null;
	/** Barre d'outils BBCode de la réponse rapide. */
	toolbar: ToolbarSettings;
	lang: Lang;
	dateWords: DateWords;
	now: number;
}

/** URL d'une page du sujet (la page 1 n'a pas de paramètre p, comme dans FluxBB). */
/** Adresse d'une discussion (services/routes.ts) ; le sujet donne le slug. */
export function topicUrl(topicId: number, page = 1, subject: string | null = null): string {
	return topicPath(topicId, subject, page);
}

/** Sujet affiché, censure comprise. */
export function displaySubject(subject: string, censor: Censor | null): string {
	return censor !== null ? censor(subject) : subject;
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

/** Options de parse_message() et parse_signature() pour ce lecteur. */
function parserOptions(input: TopicPageInput): { message: (post: Post) => BbcodeOptions; signature: BbcodeOptions } {
	const { config, viewer, lang, censor } = input;
	return {
		message: (post) => messageParserOptions(config, viewer, lang, censor, post.hideSmilies),
		signature: {
			censor,
			baseUrl: config.baseUrl,
			indentSpaces: config.indentSpaces,
			labels: bbcodeLabels(lang),
			bbcode: config.signatureBbcode,
			imgTag: config.signatureImgTag,
			showImages: viewer.showSignatureImages,
			smilies: config.signatureSmilies && viewer.showSmilies,
		},
	};
}

const contactLink = (kind: ContactLink['kind'], href: string, label: string): ContactLink => ({
	kind,
	href,
	label,
	abbrTitle: null,
	external: false,
});

/** Liens e-mail, MP (mod APMS) et site web d'un auteur inscrit, dans l'ordre de viewtopic.php. */
export function authorContactLinks(
	author: PostAuthor,
	context: { viewer: Viewer; config: BoardConfig; lang: Lang; censor: Censor | null },
): ContactLink[] {
	const { viewer, config, lang, censor } = context;
	const links: ContactLink[] = [];

	// Adresse facultative (comptes SSO) : rien à proposer sans adresse.
	if (viewer.group.canSendEmail && author.email !== '') {
		if ((author.emailSetting === 0 && !viewer.isGuest) || isAnyModerator(viewer))
			links.push(contactLink('email', `mailto:${author.email}`, lang.topic.email));
		else if (author.emailSetting === 1 && !viewer.isGuest)
			links.push(contactLink('email', `misc.php?email=${author.id}`, lang.topic.email));
	}

	if (canUsePrivateMessages(viewer, config) && author.acceptsPrivateMessages)
		links.push({ ...contactLink('pm', `pms_send.php?uid=${author.id}`, lang.pms.pmAbbr), abbrTitle: lang.pms.pmTitle });

	if (author.url !== '') {
		const url = censor !== null ? censor(author.url) : author.url;
		links.push({ ...contactLink('website', safeExternalUrl(url), lang.topic.website), external: true });
	}

	return links;
}

/** Liens de contact sous un message : ceux de l'auteur, ou l'e-mail laissé par un invité. */
function contactLinks(post: Post, input: TopicPageInput): ContactLink[] {
	const { viewer, config, lang } = input;
	if (!config.showUserInfo) return [];
	if (post.author !== null) return authorContactLinks(post.author, input);
	return post.posterEmail !== '' && !viewer.isGuest && viewer.group.canSendEmail
		? [contactLink('email', `mailto:${post.posterEmail}`, lang.topic.email)]
		: [];
}

function reputation(post: Post, author: PostAuthor, input: TopicPageInput): ReputationView | null {
	const { viewer, config } = input;
	if (!canSeeReputation(viewer, config, author)) return null;

	const vote = `reputation.php?pid=${post.id}&uid=${author.id}&method=`;
	return {
		href: `reputation.php?uid=${author.id}`,
		score: author.reputationPlus - author.reputationMinus,
		vote: canVoteReputation(viewer, post.username) ? { plusUrl: `${vote}1`, minusUrl: `${vote}2` } : null,
	};
}

/** Bouton « Accepter » d'un retour d'application (feedback_accept.php), si ce membre peut l'accepter. */
function acceptView(source: FeedbackSourceId | null, topicId: number, lang: Lang): TopicPageView['accept'] {
	return source !== null
		? { action: `feedback_accept.php?app=${source}&id=${topicId}`, label: lang.topic.acceptAppFeedback[source] }
		: null;
}

export function buildTopicPage(input: TopicPageInput): TopicPageView {
	const { viewer, config, topic, lang, censor } = input;
	const time = viewerTimeSettings(viewer);
	const format = (ts: number | null, dateOnly = false): string => formatTime(ts, time, input.dateWords, input.now, dateOnly);
	const censored = (text: string): string => (censor !== null ? censor(text) : text);
	const subject = displaySubject(topic.subject, censor);
	const titleWords = { banned: lang.common.banned, guest: lang.common.guest, member: lang.common.member };
	const parser = parserOptions(input);

	const viewerIsMod = isAnyModerator(viewer);
	const showSignatures = config.signatures && viewer.showSignatures;

	const posts = input.posts.map((post, index): PostView => {
		const position = input.firstPosition + index;
		const author = post.author;
		const showInfo = author !== null && config.showUserInfo;
		const title =
			author !== null
				? userTitle(
						{ username: post.username, title: author.title, groupId: author.groupId, groupUserTitle: author.groupUserTitle },
						input.bannedUsernames,
						titleWords,
					)
				: userTitle({ username: post.username, title: '', groupId: GroupId.Guest, groupUserTitle: '' }, input.bannedUsernames, titleWords);

		return {
			id: post.id,
			number: position,
			isFirstPost: post.id === topic.firstPostId,
			permalink: `viewtopic.php?pid=${post.id}#p${post.id}`,
			postedAt: format(post.posted),
			username: post.username,
			profileUrl: author !== null && viewer.group.canViewUsers ? `profile.php?id=${author.id}` : null,
			userTitle: author !== null ? censored(title) : title,
			avatarUrl: author !== null ? (input.avatars.get(author.id) ?? null) : null,
			location: showInfo && author.location !== '' ? censored(author.location) : null,
			registeredAt: showInfo ? format(author.registered, true) : null,
			numPosts: showInfo && (config.showPostCount || viewerIsMod) ? author.numPosts : null,
			contacts: contactLinks(post, input),
			ip: viewerIsMod ? { address: post.posterIp, href: `moderate.php?get_host=${post.id}` } : null,
			adminNote: viewerIsMod && author !== null && author.adminNote !== '' ? author.adminNote : null,
			reputation: author !== null ? reputation(post, author, input) : null,
			isOnline: author !== null ? author.isOnline : null,
			messageHtml: parseMessage(post.message, parser.message(post)),
			signatureHtml:
				showSignatures && author !== null && author.signature !== '' ? parseSignature(author.signature, parser.signature) : null,
			edited: post.edited !== null ? { by: post.editedBy, at: format(post.edited) } : null,
			actions: actionLinks(
				postActions(
					viewer,
					topic,
					{
						posterId: author?.id ?? 0,
						posterIsAdmin: author?.groupId === GroupId.Admin,
						posted: post.posted,
						isTopicPost: post.id === topic.firstPostId,
					},
					input.now,
				),
				post.id,
				topic.id,
				lang,
			),
		};
	});

	const reply = quickPost(input);
	return {
		topic: {
			id: topic.id,
			subject,
			subjectParts: subjectSegments(subject, config.subjectTags),
			closed: topic.closed,
		},
		crumbs: crumbs(
			{ label: lang.common.index, href: 'index.php' },
			{ label: topic.forum.name, href: forumPath(topic.forum.id, topic.forum.name) },
			{ label: subject, href: topicUrl(topic.id, 1, subject) },
		),
		pagination: paginationLinks(input.numPages, input.page, (page) => topicUrl(topic.id, page, subject)),
		// Bouton « Répondre » seulement sans formulaire de réponse en bas de page (AvroBB).
		replyUrl: reply === null && canReply(viewer, topic) ? `post.php?tid=${topic.id}` : null,
		prefixesUrl: canEditSubjectPrefixes(viewer, topic) ? `topic_prefixes.php?id=${topic.id}` : null,
		posts,
		quickPost: reply,
		subscription:
			!viewer.isGuest && config.topicSubscriptions
				? {
						subscribed: topic.isSubscribed,
						action: `misc.php?action=${topic.isSubscribed ? 'unsubscribe' : 'subscribe'}&tid=${topic.id}`,
					}
				: null,
		accept: acceptView(acceptableAppFeedback(viewer, topic.forum.id, config), topic.id, lang),
	};
}
