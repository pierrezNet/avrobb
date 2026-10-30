/**
 * Contrôleur de post.php : formulaire de réponse ou de nouvelle discussion (avec citation),
 * prévisualisation, puis enregistrement et notifications.
 *
 * Brouillons de PV : la case « Enregistrer comme brouillon » range le message dans la table
 * brouillons au lieu de le publier ; post.php?brouillon&id=… le reprend en prévisualisation.
 * Écart assumé : publier un brouillon repris le supprime (le PHP le laissait dans la liste).
 */

import type { Mailer } from '../adapters/mailer.ts';
import type { CookieConfig } from '../config.ts';
import type { BoardConfig, PostingTarget } from '../domain/models.ts';
import type { AppReply, AppRequest } from '../http/context.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { sendInBackground } from '../http/mail.ts';
import { setForumCookie } from '../http/session.ts';
import { buildPostPage, type PostFormState } from '../presenters/postPage.ts';
import type { BanReader } from '../repositories/BanRepository.ts';
import type { CensorReader } from '../repositories/CensorRepository.ts';
import type { DraftStore } from '../repositories/DraftRepository.ts';
import type { NewPostAuthor, PostingStore } from '../repositories/PostingRepository.ts';
import type { StopwordsReader } from '../repositories/StopwordsLoader.ts';
import type { AccountLookup } from '../repositories/UserRepository.ts';
import { normalizeUsername, usernameSkeleton } from '../services/accounts.ts';
import { bbcodeToEmail } from '../services/bbcodeEmail.ts';
import { buildCensor, type Censor } from '../services/censor.ts';
import type { MailMessage, MailTemplateReader } from '../services/mail.ts';
import { bannedEmailAlert, notifySubscribers, type PostLinks, replyValues, topicValues } from '../services/notifications.ts';
import { canPostIn, isAnyModerator, isForumModerator } from '../services/permissions.ts';
import { type PostForm, promotionGroup, quoteText, subscriptionChange, type ValidatedPost, validatePost } from '../services/posting.ts';
import { indexWords } from '../services/searchIndex.ts';
import { needsProjectTagWarning } from '../services/subjectPrefixes.ts';
import { TOOLBAR } from '../services/toolbar.ts';
import { markRead, parseTrackedTopics, serializeTrackedTopics } from '../services/trackedTopics.ts';
import { type MentionNotifierDeps, notifyMentions } from './mentionNotifier.ts';
import { positiveInt } from './params.ts';

export interface PostControllerDeps extends LayoutDeps {
	posting: PostingStore;
	bans: BanReader;
	censorship: CensorReader;
	accounts: AccountLookup;
	stopwords: StopwordsReader;
	mailTemplates: MailTemplateReader;
	mailer: Mailer;
	cookie: CookieConfig;
	trackCookieName: string;
	drafts: DraftStore;
	privateMessageStore: MentionNotifierDeps['privateMessageStore'];
	topics: MentionNotifierDeps['topics'];
}

/** Longueur maximale d'un passage cité par sélection. */
const QUOTE_SELECTION_MAX = 5000;

export interface PostQuery {
	tid?: string;
	fid?: string;
	qid?: string;
	/** Passage sélectionné du message cité (public/js/quote-selection.js) ; sinon tout le message. */
	qtext?: string;
	action?: string;
	brouillon?: string;
	/** Brouillon à reprendre (post.php?brouillon&id=…). */
	id?: string;
}

type PostRequest = AppRequest<{ Querystring: PostQuery; Body?: FormBody }>;

const checked = (body: FormBody | undefined, name: string): boolean => body?.[name] !== undefined;

export class PostController {
	constructor(private readonly deps: PostControllerDeps) {}

	show = async (request: AppRequest<{ Querystring: PostQuery }>, reply: AppReply): Promise<AppReply> => {
		const { viewer } = request;
		if (request.query.brouillon !== undefined) return this.resumeDraft(request, reply);

		const target = await this.resolveTarget(request, reply, this.queryIds(request));
		if (!('forum' in target)) return target;
		const censor = await this.censor(request.board);

		let message = '';
		if (request.query.qid !== undefined && target.topic !== null) {
			const quoted = await this.quote(request.query.qid, target.topic.id, request.board, censor, request.query.qtext);
			if (quoted === null) return renderMessage(request, reply, this.deps, 404, this.deps.page.lang.common.badRequest);
			message = quoted;
		}

		const form: PostFormState = {
			subject: '',
			message,
			username: '',
			email: '',
			hideSmilies: false,
			subscribe: viewer.autoNotify || target.topic?.isSubscribed === true,
			stickTopic: false,
			draft: false,
			draftId: null,
		};
		return this.renderForm(request, reply, target, censor, form, [], null);
	};

	/**
	 * Brouillon de son auteur : prévisualisé dans le formulaire (GET post.php?brouillon&id=…), ou
	 * publié directement par le bouton « Poster » de draft_list.php (POST, jeton CSRF vérifié).
	 */
	publishDraft = (request: AppRequest<{ Querystring: PostQuery; Body: FormBody }>, reply: AppReply): Promise<AppReply> =>
		this.resumeDraft(request, reply, true);

	private async resumeDraft(request: PostRequest, reply: AppReply, publish = false): Promise<AppReply> {
		const { viewer } = request;
		const { lang } = this.deps.page;
		const id = positiveInt(request.query.id);
		const draft = id > 0 && !viewer.isGuest ? await this.deps.drafts.find(id) : null;
		if (draft === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
		if (draft.posterId !== viewer.id) return renderMessage(request, reply, this.deps, 403, lang.common.noPermission);

		const target = await this.resolveTarget(
			request,
			reply,
			draft.topicId !== null ? { tid: draft.topicId, fid: 0 } : { tid: 0, fid: draft.forum.id },
		);
		if (!('forum' in target)) return target;
		const censor = await this.censor(request.board);
		const form: PostForm = {
			subject: target.topic === null ? draft.subject : null,
			message: draft.message,
			username: '',
			email: '',
			hideSmilies: false,
			subscribe: viewer.autoNotify || target.topic?.isSubscribed === true,
			stickTopic: false,
			preview: !publish,
		};
		return this.process(request, reply, target, censor, form, { asDraft: false, draftId: draft.id });
	}

	private stateOf(form: PostForm, post: ValidatedPost): Omit<PostFormState, 'draft' | 'draftId'> {
		return {
			subject: form.subject ?? '',
			message: post.originalMessage,
			username: form.username,
			email: form.email,
			hideSmilies: form.hideSmilies,
			subscribe: form.subscribe,
			stickTopic: form.stickTopic,
		};
	}

	submit = async (request: AppRequest<{ Querystring: PostQuery; Body: FormBody }>, reply: AppReply): Promise<AppReply> => {
		const { viewer, board: config, body } = request;
		const target = await this.resolveTarget(request, reply, this.queryIds(request));
		if (!('forum' in target)) return target;
		const censor = await this.censor(config);
		const draftId = positiveInt(field(body, 'brouillon_id'));
		const asDraft = !viewer.isGuest && checked(body, 'brouillon');

		const form: PostForm = {
			subject: target.topic === null ? field(body, 'req_subject') : null,
			message: field(body, 'req_message'),
			username: field(body, 'req_username'),
			email: field(body, config.posting.forceGuestEmail ? 'req_email' : 'email'),
			hideSmilies: checked(body, 'hide_smilies'),
			subscribe: checked(body, 'subscribe'),
			stickTopic: checked(body, 'stick_topic'),
			preview: checked(body, 'preview'),
		};
		return this.process(request, reply, target, censor, form, {
			asDraft,
			draftId: draftId > 0 ? draftId : null,
			confirmNoTag: field(body, 'no_tag_ok') !== '',
		});
	};

	/**
	 * Suite commune de l'envoi : formulaire réaffiché (erreurs, prévisualisation), brouillon
	 * enregistré, ou message publié (le brouillon repris est alors supprimé).
	 */
	private async process(
		request: PostRequest,
		reply: AppReply,
		target: PostingTarget,
		censor: Censor | null,
		form: PostForm,
		{ asDraft, draftId, confirmNoTag = false }: { asDraft: boolean; draftId: number | null; confirmNoTag?: boolean },
	): Promise<AppReply> {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		const now = this.deps.page.clock();
		const post = await this.validate(request, target, form, censor);

		if (post.errors.length > 0 || form.preview) {
			const errors = post.errors.map((error) => lang.post.postError(error));
			const state: PostFormState = { ...this.stateOf(form, post), draft: asDraft, draftId };
			return this.renderForm(request, reply, target, censor, state, errors, errors.length === 0 ? post.message : null);
		}

		// Nouvelle discussion sans balise de projet : avertir une fois, publier au second envoi.
		if (target.topic === null && !asDraft && needsProjectTagWarning(post.subject, config.subjectTags, confirmNoTag)) {
			const state: PostFormState = { ...this.stateOf(form, post), draft: asDraft, draftId, tagWarning: true };
			return this.renderForm(request, reply, target, censor, state, [], null);
		}

		if (asDraft) {
			const id = await this.deps.drafts.create({
				poster: viewer.username,
				posterId: viewer.id,
				subject: target.topic === null ? post.subject : null,
				message: post.message,
				posted: now,
				topicId: target.topic?.id ?? null,
				forumId: target.forum.id,
			});
			return reply.redirect(`draft_list.php?id=${id}`);
		}

		const { topicId, postId } = await this.save(request, target, post, now);
		if (draftId !== null && !viewer.isGuest) await this.deps.drafts.delete(draftId, viewer.id);
		await this.notify(request, target, post, censor, { topicId, postId });
		if (!viewer.isGuest)
			await notifyMentions(
				this.deps,
				{
					config: request.board,
					author: { id: viewer.id, username: viewer.username, ip: request.ip, isModerator: isAnyModerator(viewer) },
					message: post.message,
					topicId,
					postId,
					subject: target.topic !== null ? (censor !== null ? censor(target.topic.subject) : target.topic.subject) : post.censoredSubject,
				},
				request.log,
			);

		if (!viewer.isGuest) {
			const tracked = markRead(parseTrackedTopics(request.cookies[this.deps.trackCookieName]), 'topics', topicId, now);
			setForumCookie(
				reply,
				this.deps.cookie,
				this.deps.trackCookieName,
				serializeTrackedTopics(tracked),
				now + config.timeoutVisit,
				now,
				config.timeoutVisit,
			);
		}
		return reply.redirect(`viewtopic.php?pid=${postId}#p${postId}`);
	}

	/** Validation de post.php pour ce visiteur et cette cible. */
	private async validate(request: PostRequest, target: PostingTarget, form: PostForm, censor: Censor | null): Promise<ValidatedPost> {
		const { viewer, board: config } = request;
		const [bans, similarUsername] = await Promise.all([
			this.deps.bans.listBans(),
			viewer.isGuest ? this.similarUsername(form.username) : null,
		]);
		return validatePost(form, {
			viewer,
			now: this.deps.page.clock(),
			isAnyModerator: isAnyModerator(viewer),
			isForumModerator: isForumModerator(viewer, target.forum),
			config: {
				bbcode: config.bbcode,
				subjectAllCaps: config.posting.subjectAllCaps,
				messageAllCaps: config.posting.messageAllCaps,
				forceGuestEmail: config.posting.forceGuestEmail,
				subjectTags: config.subjectTags,
				allowBannedEmail: config.registration.allowBannedEmail,
			},
			preparse: {
				quoteDepth: config.posting.quoteDepth,
				makeLinks: config.posting.makeLinks,
				indentSpaces: config.indentSpaces,
				baseUrl: config.baseUrl,
			},
			censor,
			bans,
			similarUsername,
			guestLabel: this.deps.page.lang.common.guest,
		});
	}

	private queryIds(request: PostRequest): { tid: number; fid: number } {
		return { tid: positiveInt(request.query.tid), fid: positiveInt(request.query.fid) };
	}

	/** tid ou fid (l'un des deux), cible lisible, pas une redirection, et droit d'y écrire. */
	private async resolveTarget(
		request: PostRequest,
		reply: AppReply,
		{ tid, fid }: { tid: number; fid: number },
	): Promise<PostingTarget | AppReply> {
		const { viewer } = request;
		const { lang } = this.deps.page;
		if (!viewer.group.canReadBoard) return renderMessage(request, reply, this.deps, 403, lang.common.noView);

		if ((tid === 0) === (fid === 0)) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);

		const target = await this.deps.posting.findTarget(tid > 0 ? { topicId: tid } : { forumId: fid }, {
			id: viewer.id,
			groupId: viewer.group.id,
		});
		if (target === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
		if (target.forum.isRedirect) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
		if (!canPostIn(viewer, target)) return renderMessage(request, reply, this.deps, 403, lang.common.noPermission);
		return target;
	}

	private async censor(config: BoardConfig): Promise<Censor | null> {
		return config.censoring ? buildCensor(await this.deps.censorship.listWords()) : null;
	}

	private async similarUsername(username: string): Promise<string | null> {
		const normalized = normalizeUsername(username);
		return this.deps.accounts.findSimilarUsername(normalized, usernameSkeleton(normalized));
	}

	/**
	 * Texte de la citation (post.php?qid=…), ou null si le message n'est pas dans ce sujet. Avec
	 * `qtext` (texte sélectionné dans la page, AvroBB), seul ce passage est cité, sous le nom de
	 * l'auteur du message ; il n'est que proposé dans le champ, que le membre peut de toute façon modifier.
	 */
	private async quote(
		rawQid: string,
		topicId: number,
		config: BoardConfig,
		censor: Censor | null,
		selection?: string,
	): Promise<string | null> {
		const qid = positiveInt(rawQid);
		const quoted = qid > 0 ? await this.deps.posting.findQuote(qid, topicId) : null;
		if (quoted === null) return null;
		const passage = quotedSelection(selection);
		return quoteText(quoted.poster, passage ?? quoted.message, {
			bbcode: config.bbcode,
			indentSpaces: config.indentSpaces,
			censor,
			wrote: this.deps.page.lang.common.wrote,
		});
	}

	private async renderForm(
		request: PostRequest,
		reply: AppReply,
		target: PostingTarget,
		censor: Censor | null,
		form: PostFormState,
		errors: string[],
		preview: string | null,
	): Promise<AppReply> {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		const review =
			target.topic !== null && config.posting.topicReview > 0
				? await this.deps.posting.listReview(target.topic.id, config.posting.topicReview)
				: [];

		const view = buildPostPage({
			viewer,
			config,
			target,
			isForumModerator: isForumModerator(viewer, target.forum),
			form,
			errors,
			preview,
			review,
			toolbar: TOOLBAR,
			censor,
			lang,
			dateWords: this.deps.page.dateWords,
			now: this.deps.page.clock(),
		});
		return renderPage(
			request,
			reply,
			this.deps,
			'post.njk',
			{ pageId: 'post', titleParts: [config.boardTitle, view.heading], activeNav: 'index' },
			view,
		);
	}

	/** Enregistrement de la réponse ou de la discussion, avec tous ses effets de bord. */
	private async save(
		request: PostRequest,
		target: PostingTarget,
		post: ValidatedPost,
		now: number,
	): Promise<{ topicId: number; postId: number }> {
		const { viewer, board: config } = request;
		const stopwords = await this.deps.stopwords.load();
		const author: NewPostAuthor = viewer.isGuest
			? { kind: 'guest', username: post.username, email: config.posting.forceGuestEmail || post.email !== '' ? post.email : null }
			: { kind: 'member', id: viewer.id, username: viewer.username, promoteTo: promotionGroup(viewer) };
		const common = { author, ip: request.ip, message: post.message, hideSmilies: post.hideSmilies, now };

		if (target.topic !== null) {
			const postId = await this.deps.posting.createReply({
				...common,
				topicId: target.topic.id,
				forumId: target.forum.id,
				words: indexWords(post.message, null, stopwords),
				subscription: viewer.isGuest ? null : subscriptionChange(config.topicSubscriptions, post.subscribe, target.topic.isSubscribed),
			});
			return { topicId: target.topic.id, postId };
		}

		return this.deps.posting.createTopic({
			...common,
			forumId: target.forum.id,
			subject: post.subject,
			sticky: post.stickTopic,
			subscribe: config.topicSubscriptions && post.subscribe,
			words: indexWords(post.message, post.subject, stopwords),
		});
	}

	/**
	 * Notifications aux abonnés et alerte « e-mail banni ». Envoyées après l'enregistrement : un
	 * échec d'envoi est journalisé sans annuler le message (le PHP s'arrêtait sur une erreur).
	 */
	private async notify(
		request: PostRequest,
		target: PostingTarget,
		post: ValidatedPost,
		censor: Censor | null,
		ids: { topicId: number; postId: number },
	): Promise<void> {
		const { topicId, postId } = ids;
		const { viewer, board: config } = request;
		const links: PostLinks = { baseUrl: config.baseUrl, boardTitle: config.boardTitle };
		const message = (): string => bbcodeToEmail(post.censoredMessage, config.baseUrl, config.indentSpaces);
		const mails: MailMessage[] = [];

		if (target.topic !== null && config.topicSubscriptions) {
			const subscribers = await this.deps.posting.listTopicSubscribers(topicId, target.forum.id, viewer.id);
			if (subscribers.length > 0) {
				const [short, full] = await Promise.all([
					this.deps.mailTemplates.load('new_reply'),
					this.deps.mailTemplates.load('new_reply_full'),
				]);
				const values = replyValues(links, {
					topicId,
					// Sujet censuré au chargement, comme $cur_posting['subject'] dans post.php.
					topicSubject: censor !== null ? censor(target.topic.subject) : target.topic.subject,
					postId,
					replier: post.username,
					message: message(),
				});
				mails.push(...notifySubscribers(subscribers, { short, full }, values));
			}
		} else if (target.topic === null && config.forumSubscriptions) {
			const subscribers = await this.deps.posting.listForumSubscribers(target.forum.id, viewer.id);
			if (subscribers.length > 0) {
				const [short, full] = await Promise.all([
					this.deps.mailTemplates.load('new_topic'),
					this.deps.mailTemplates.load('new_topic_full'),
				]);
				const values = topicValues(links, {
					forumId: target.forum.id,
					forumName: target.forum.name,
					topicId,
					subject: post.censoredSubject,
					poster: post.username,
					message: message(),
				});
				mails.push(...notifySubscribers(subscribers, { short, full }, values));
			}
		}

		if (viewer.isGuest && post.bannedEmail && config.registration.mailingList !== '') {
			const template = await this.deps.mailTemplates.load('banned_email_post');
			mails.push(
				bannedEmailAlert(template, config.registration.mailingList, links, { username: post.username, email: post.email, postId }),
			);
		}

		sendInBackground(request, this.deps.mailer, mails, config);
	}
}

/** Passage sélectionné (?qtext=) : texte nettoyé et borné, ou null s'il n'y en a pas. */
function quotedSelection(raw: string | undefined): string | null {
	const text = (raw ?? '').replaceAll('\r\n', '\n').trim();
	return text !== '' ? [...text].slice(0, QUOTE_SELECTION_MAX).join('') : null;
}
