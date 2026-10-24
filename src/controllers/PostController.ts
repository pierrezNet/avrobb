/**
 * Contrôleur de post.php : formulaire de réponse ou de nouvelle discussion (avec citation),
 * prévisualisation, puis enregistrement et notifications.
 *
 * Les brouillons de PV (post.php?brouillon, case « Enregistrer comme brouillon ») ne sont pas
 * encore portés : le lien d'un brouillon est renvoyé vers le PHP, et la case n'est pas proposée.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Mailer } from '../adapters/mailer.ts';
import type { LegacyCookieConfig } from '../config.ts';
import type { BoardConfig, PostingTarget } from '../domain/models.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { setForumCookie } from '../http/session.ts';
import { buildPostPage, type PostFormState } from '../presenters/postPage.ts';
import type { BanReader } from '../repositories/BanRepository.ts';
import type { CensorReader } from '../repositories/CensorRepository.ts';
import type { MailTemplateReader } from '../repositories/MailTemplateFiles.ts';
import type { NewPostAuthor, PostingStore } from '../repositories/PostingRepository.ts';
import type { RegistrationStore } from '../repositories/RegistrationRepository.ts';
import type { StopwordsReader } from '../repositories/StopwordsLoader.ts';
import type { ToolbarReader } from '../repositories/ToolbarRepository.ts';
import { bbcodeToEmail } from '../services/bbcodeEmail.ts';
import { buildCensor, type Censor } from '../services/censor.ts';
import type { MailMessage } from '../services/mail.ts';
import { bannedEmailAlert, notifySubscribers, type PostLinks, replyValues, topicValues } from '../services/notifications.ts';
import { canPostIn, isAnyModerator, isForumModerator } from '../services/permissions.ts';
import { type PostForm, promotionGroup, quoteText, subscriptionChange, type ValidatedPost, validatePost } from '../services/posting.ts';
import { normalizeUsername, usernameSkeleton } from '../services/registration.ts';
import { indexWords } from '../services/searchIndex.ts';
import { DEFAULT_TOOLBAR } from '../services/toolbar.ts';
import { markRead, parseTrackedTopics, serializeTrackedTopics } from '../services/trackedTopics.ts';
import { positiveInt } from './params.ts';

export interface PostControllerDeps extends LayoutDeps {
	posting: PostingStore;
	bans: BanReader;
	censorship: CensorReader;
	registrations: RegistrationStore;
	stopwords: StopwordsReader;
	mailTemplates: MailTemplateReader;
	mailer: Mailer;
	legacyCookie: LegacyCookieConfig;
	trackCookieName: string;
	legacyBaseUrl: string;
	toolbar: ToolbarReader;
}

export interface PostQuery {
	tid?: string;
	fid?: string;
	qid?: string;
	action?: string;
	brouillon?: string;
}

type PostRequest = FastifyRequest<{ Querystring: PostQuery; Body?: FormBody }>;

const checked = (body: FormBody | undefined, name: string): boolean => body?.[name] !== undefined;

export class PostController {
	constructor(private readonly deps: PostControllerDeps) {}

	show = async (request: FastifyRequest<{ Querystring: PostQuery }>, reply: FastifyReply): Promise<FastifyReply> => {
		const { viewer } = request;

		// Reprise d'un brouillon (mod de PV) : pas encore portée.
		if (request.query.brouillon !== undefined && this.deps.legacyBaseUrl !== '') {
			const search = request.url.slice(request.url.indexOf('?'));
			return reply.redirect(`${this.deps.legacyBaseUrl}/post.php${search}`);
		}

		const target = await this.resolveTarget(request, reply);
		if (!('forum' in target)) return target;
		const censor = await this.censor(request.board);

		let message = '';
		if (request.query.qid !== undefined && target.topic !== null) {
			const quoted = await this.quote(request.query.qid, target.topic.id, request.board, censor);
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
		};
		return this.renderForm(request, reply, target, censor, form, [], null);
	};

	submit = async (request: FastifyRequest<{ Querystring: PostQuery; Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> => {
		const { viewer, board: config, body } = request;
		const { lang } = this.deps.page;

		const target = await this.resolveTarget(request, reply);
		if (!('forum' in target)) return target;
		const censor = await this.censor(config);
		const now = this.deps.page.clock();

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

		const [bans, similarUsername] = await Promise.all([
			this.deps.bans.listBans(),
			viewer.isGuest ? this.similarUsername(form.username) : null,
		]);
		const post = validatePost(form, {
			viewer,
			now,
			isAnyModerator: isAnyModerator(viewer),
			isForumModerator: isForumModerator(viewer, target.forum),
			config: {
				bbcode: config.bbcode,
				subjectAllCaps: config.posting.subjectAllCaps,
				messageAllCaps: config.posting.messageAllCaps,
				forceGuestEmail: config.posting.forceGuestEmail,
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
			guestLabel: lang.common.guest,
		});

		if (post.errors.length > 0 || form.preview) {
			const state: PostFormState = {
				subject: form.subject ?? '',
				message: post.originalMessage,
				username: form.username,
				email: form.email,
				hideSmilies: form.hideSmilies,
				subscribe: form.subscribe,
				stickTopic: form.stickTopic,
			};
			const errors = post.errors.map((error) => lang.post.postError(error));
			return this.renderForm(request, reply, target, censor, state, errors, errors.length === 0 ? post.message : null);
		}

		const { topicId, postId } = await this.save(request, target, post, now);
		await this.notify(request, target, post, censor, { topicId, postId });

		if (!viewer.isGuest) {
			const tracked = markRead(parseTrackedTopics(request.cookies[this.deps.trackCookieName]), 'topics', topicId, now);
			setForumCookie(
				reply,
				this.deps.legacyCookie,
				this.deps.trackCookieName,
				serializeTrackedTopics(tracked),
				now + config.timeoutVisit,
				now,
				config.timeoutVisit,
			);
		}
		return reply.redirect(`viewtopic.php?pid=${postId}#p${postId}`);
	};

	/** tid ou fid (l'un des deux), cible lisible, pas une redirection, et droit d'y écrire. */
	private async resolveTarget(request: PostRequest, reply: FastifyReply): Promise<PostingTarget | FastifyReply> {
		const { viewer } = request;
		const { lang } = this.deps.page;
		if (!viewer.group.canReadBoard) return renderMessage(request, reply, this.deps, 403, lang.common.noView);

		const tid = positiveInt(request.query.tid);
		const fid = positiveInt(request.query.fid);
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
		return this.deps.registrations.findSimilarUsername(normalized, usernameSkeleton(normalized));
	}

	/** Texte de la citation (post.php?qid=…), ou null si le message n'est pas dans ce sujet. */
	private async quote(rawQid: string, topicId: number, config: BoardConfig, censor: Censor | null): Promise<string | null> {
		const qid = positiveInt(rawQid);
		const quoted = qid > 0 ? await this.deps.posting.findQuote(qid, topicId) : null;
		if (quoted === null) return null;
		return quoteText(quoted.poster, quoted.message, {
			bbcode: config.bbcode,
			indentSpaces: config.indentSpaces,
			censor,
			wrote: this.deps.page.lang.common.wrote,
		});
	}

	private async renderForm(
		request: PostRequest,
		reply: FastifyReply,
		target: PostingTarget,
		censor: Censor | null,
		form: PostFormState,
		errors: string[],
		preview: string | null,
	): Promise<FastifyReply> {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		const [review, toolbar] = await Promise.all([
			target.topic !== null && config.posting.topicReview > 0
				? this.deps.posting.listReview(target.topic.id, config.posting.topicReview)
				: [],
			this.deps.toolbar.load(),
		]);

		const view = buildPostPage({
			viewer,
			config,
			target,
			isForumModerator: isForumModerator(viewer, target.forum),
			form,
			errors,
			preview,
			review,
			toolbar: toolbar ?? DEFAULT_TOOLBAR,
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

		for (const mail of mails) {
			try {
				await this.deps.mailer.send(mail, config);
			} catch (error) {
				request.log.error({ err: error }, "Échec de l'envoi d'une notification");
			}
		}
	}
}
