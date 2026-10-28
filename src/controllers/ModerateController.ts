/**
 * Contrôleur de moderate.php : consultation d'une IP (?get_host=), liste des sujets d'un forum à
 * modérer, messages d'un sujet à modérer, et leurs actions (déplacer, fusionner, supprimer, ouvrir,
 * fermer, épingler, scinder, baliser).
 *
 * Écarts assumés : toutes les actions écrivent en POST avec jeton CSRF ; les anciens liens GET du
 * PHP (fermer, épingler, balises PV) mènent à une confirmation ; un modérateur ne peut pas
 * supprimer les messages d'un administrateur, en sujet comme en message isolé (le PHP vérifiait
 * seulement le second cas en partie) ; le premier message d'un sujet n'est jamais supprimé ni
 * scindé, même par une requête forgée ; les erreurs s'affichent dans la page.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ForumInfo } from '../domain/models.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildForumChoice, buildModerateForum, buildModerateTopic } from '../presenters/moderatePage.ts';
import type { BanReader } from '../repositories/BanRepository.ts';
import type { CensorReader } from '../repositories/CensorRepository.ts';
import type { ModerationStore } from '../repositories/ModerationRepository.ts';
import type { PostReader } from '../repositories/PostRepository.ts';
import type { TopicLabelReader } from '../repositories/TopicLabelRepository.ts';
import type { TopicReader } from '../repositories/TopicRepository.ts';
import { buildCensor, type Censor } from '../services/censor.ts';
import { isIpAddress } from '../services/hosts.ts';
import { pageCount } from '../services/pagination.ts';
import { isAdmin, isAnyModerator, isForumModerator } from '../services/permissions.ts';
import { punTrim } from '../services/phpString.ts';
import { MAX_SUBJECT_LENGTH } from '../services/posting.ts';
import { parseTrackedTopics } from '../services/trackedTopics.ts';
import { idList, positiveInt } from './params.ts';

/** Résolution inverse d'une adresse IP (gethostbyaddr()). */
export interface HostResolver {
	/** Nom d'hôte, ou l'adresse elle-même si elle ne se résout pas. */
	reverse(ip: string): Promise<string>;
}

export interface ModerateControllerDeps extends LayoutDeps {
	moderation: ModerationStore;
	topics: TopicReader;
	posts: PostReader;
	topicLabels: TopicLabelReader;
	bans: BanReader;
	censorship: CensorReader;
	hostResolver: HostResolver;
	trackCookieName: string;
}

export interface ModerateQuery {
	fid?: string;
	tid?: string;
	p?: string;
	get_host?: string;
	move_topics?: string;
	open?: string;
	close?: string;
	stick?: string;
	unstick?: string;
	balise?: string;
	nobalise?: string;
	npost?: string;
	done?: string;
}

type ModerateRequest = FastifyRequest<{ Querystring: ModerateQuery; Body?: FormBody }>;
type ModeratePost = FastifyRequest<{ Querystring: ModerateQuery; Body: FormBody }>;

/** Actions sur un seul sujet, désigné dans l'adresse (liens du pied de viewtopic). */
const SINGLE_ACTIONS = ['open', 'close', 'stick', 'unstick', 'balise', 'nobalise'] as const;
type SingleAction = (typeof SINGLE_ACTIONS)[number];

/** Formulaire de confirmation ou de choix (moderate_form.njk). */
interface ModerateFormView {
	title: string;
	legend: string;
	text: string | null;
	action: string;
	hidden: { name: string; value: string }[];
	forums: ReturnType<typeof buildForumChoice> | null;
	subject: string | null;
	redirect: { checked: boolean } | null;
	submit: { name: string; label: string };
	backUrl: string;
	errors: string[];
}

export class ModerateController {
	constructor(private readonly deps: ModerateControllerDeps) {}

	show = async (request: ModerateRequest, reply: FastifyReply): Promise<FastifyReply> => {
		const { query } = request;
		if (query.get_host !== undefined) return this.hostInfo(request, reply);
		const forum = await this.moderatedForum(request, reply);
		if (!('moderators' in forum)) return forum;

		if (query.tid !== undefined) return this.topicView(request, reply, forum, []);
		if (query.move_topics !== undefined) {
			const id = positiveInt(query.move_topics);
			if (id < 1) return this.badRequest(request, reply);
			return this.moveForm(request, reply, forum, [id], true, []);
		}
		const single = this.singleAction(query);
		if (single !== null) return this.confirmSingle(request, reply, single);
		return this.forumView(request, reply, forum, []);
	};

	submit = async (request: ModeratePost, reply: FastifyReply): Promise<FastifyReply> => {
		const { query, body } = request;
		const forum = await this.moderatedForum(request, reply);
		if (!('moderators' in forum)) return forum;

		if (query.tid !== undefined) return this.postActions(request, reply, forum);
		const single = this.singleAction(query);
		if (single !== null) return this.applySingle(request, reply, forum, single);

		if (body.move_topics !== undefined || body.move_topics_to !== undefined) return this.moveTopics(request, reply, forum);
		if (body.merge_topics !== undefined || body.merge_topics_comply !== undefined) return this.mergeTopics(request, reply, forum);
		if (body.delete_topics !== undefined || body.delete_topics_comply !== undefined) return this.deleteTopics(request, reply, forum);
		if (body.open !== undefined || body.close !== undefined) {
			const topics = idList(body, 'topics');
			if (topics.length === 0) return this.forumView(request, reply, forum, [this.deps.page.lang.moderate.noTopicsSelected]);
			const closed = body.close !== undefined;
			await this.deps.moderation.setClosed(forum.id, topics, closed);
			return reply.redirect(`moderate.php?fid=${forum.id}&done=${closed ? 'closed' : 'opened'}`, 303);
		}
		return this.badRequest(request, reply);
	};

	// ——— Accès ———

	/** Forum désigné par fid, que le lecteur modère ; sinon la réponse d'erreur. */
	private async moderatedForum(request: ModerateRequest, reply: FastifyReply): Promise<ForumInfo | FastifyReply> {
		const { viewer } = request;
		const { lang } = this.deps.page;
		const fid = positiveInt(request.query.fid);
		const forum = fid > 0 ? await this.deps.forums.findReadable(fid, viewer.group.id, null) : null;
		if (forum === null || forum.redirectUrl !== null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
		if (!isForumModerator(viewer, forum)) return renderMessage(request, reply, this.deps, 403, lang.common.noPermission);
		return forum;
	}

	private badRequest(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
		return renderMessage(request, reply, this.deps, 400, this.deps.page.lang.common.badRequest);
	}

	private singleAction(query: ModerateQuery): { action: SingleAction; topicId: number; labelId: number } | null {
		for (const action of SINGLE_ACTIONS) {
			const value = query[action];
			if (value === undefined) continue;
			const isLabel = action === 'balise' || action === 'nobalise';
			return { action, topicId: positiveInt(isLabel ? query.npost : value), labelId: isLabel ? positiveInt(value) : 0 };
		}
		return null;
	}

	private async censor(request: FastifyRequest): Promise<Censor | null> {
		return request.board.censoring ? buildCensor(await this.deps.censorship.listWords()) : null;
	}

	// ——— get_host ———

	private async hostInfo(request: ModerateRequest, reply: FastifyReply): Promise<FastifyReply> {
		const { lang } = this.deps.page;
		if (!isAnyModerator(request.viewer)) return renderMessage(request, reply, this.deps, 403, lang.common.noPermission);
		const value = request.query.get_host ?? '';
		let ip: string | null = isIpAddress(value) ? value : null;
		if (ip === null) {
			const postId = positiveInt(value);
			if (postId < 1) return this.badRequest(request, reply);
			ip = await this.deps.moderation.findPostIp(postId);
			if (ip === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
		}
		const host = await this.deps.hostResolver.reverse(ip);
		return renderMessage(request, reply, this.deps, 200, `${lang.moderate.hostInfo1(ip)} ${lang.moderate.hostInfo2(host)}`, {
			href: `admin_users.php?show_users=${encodeURIComponent(ip)}`,
			label: lang.moderate.showMoreUsers,
		});
	}

	// ——— Forum ———

	private async forumView(request: ModerateRequest, reply: FastifyReply, forum: ForumInfo, errors: string[]): Promise<FastifyReply> {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		const perPage = viewer.topicsPerPage ?? config.defaultTopicsPerPage;
		const numPages = pageCount(forum.numTopics, perPage);
		const requested = positiveInt(request.query.p);
		const page = requested >= 1 && requested <= numPages ? requested : 1;

		const topics = await this.deps.topics.listForumPage(forum.id, forum.sortBy, (page - 1) * perPage, perPage, null);
		const [topicLabels, labelDefinitions, censor] = await Promise.all([
			this.deps.topicLabels.listForTopics(topics.map((topic) => topic.id)),
			this.deps.topicLabels.listDefinitions(),
			this.censor(request),
		]);
		const notices: Record<string, string> = lang.moderate.done;
		const view = buildModerateForum({
			viewer,
			config,
			forum,
			topics,
			topicLabels,
			labelDefinitions,
			tracked: parseTrackedTopics(request.cookies[this.deps.trackCookieName]),
			censor,
			page,
			numPages,
			lang,
			dateWords: this.deps.page.dateWords,
			now: this.deps.page.clock(),
			notice: notices[request.query.done ?? ''] ?? null,
			errors,
		});
		return renderPage(
			request,
			reply,
			this.deps,
			'moderate_forum.njk',
			{
				pageId: 'moderate',
				titleParts: [config.boardTitle, forum.name, lang.moderate.moderate],
				pageNumber: page > 1 ? page : null,
				activeNav: 'index',
			},
			view,
		);
	}

	// ——— Sujet ———

	private async findTopic(request: ModerateRequest, forum: ForumInfo) {
		return this.deps.moderation.findTopic(positiveInt(request.query.tid), forum.id, request.viewer.group.id);
	}

	private async topicView(request: ModerateRequest, reply: FastifyReply, forum: ForumInfo, errors: string[]): Promise<FastifyReply> {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		const topic = await this.findTopic(request, forum);
		if (topic === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);

		const perPage = viewer.postsPerPage ?? config.defaultPostsPerPage;
		const numPages = pageCount(topic.numReplies + 1, perPage);
		const requested = positiveInt(request.query.p);
		const page = requested >= 1 && requested <= numPages ? requested : 1;
		const [posts, bannedUsernames, censor] = await Promise.all([
			this.deps.posts.listPage(topic.id, (page - 1) * perPage, perPage),
			this.deps.bans.listBannedUsernames(),
			this.censor(request),
		]);
		const view = buildModerateTopic({
			viewer,
			config,
			topic,
			posts,
			firstPosition: (page - 1) * perPage + 1,
			page,
			numPages,
			bannedUsernames,
			censor,
			lang,
			dateWords: this.deps.page.dateWords,
			now: this.deps.page.clock(),
			errors,
		});
		return renderPage(
			request,
			reply,
			this.deps,
			'moderate_topic.njk',
			{
				pageId: 'moderate',
				titleParts: [config.boardTitle, forum.name, view.topic.subject],
				pageNumber: page > 1 ? page : null,
				activeNav: 'index',
			},
			view,
		);
	}

	/** Suppression ou scission de messages d'un sujet (avec confirmation). */
	private async postActions(request: ModeratePost, reply: FastifyReply, forum: ForumInfo): Promise<FastifyReply> {
		const { viewer, body } = request;
		const { lang } = this.deps.page;
		const t = lang.moderate;
		const topic = await this.findTopic(request, forum);
		if (topic === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
		const posts = idList(body, 'posts');
		const deleting = body.delete_posts !== undefined || body.delete_posts_comply !== undefined;
		if (!deleting && body.split_posts === undefined && body.split_posts_comply === undefined) return this.badRequest(request, reply);
		if (posts.length === 0) return this.topicView(request, reply, forum, [t.noPostsSelected]);

		const base = `moderate.php?fid=${forum.id}&tid=${topic.id}`;
		const hidden = [{ name: 'posts', value: posts.join(',') }];

		if (deleting) {
			if (body.delete_posts_comply === undefined)
				return this.renderForm(request, reply, {
					title: t.deletePosts,
					legend: t.confirmDeleteLegend,
					text: t.deletePostsComply,
					action: base,
					hidden,
					forums: null,
					subject: null,
					redirect: null,
					submit: { name: 'delete_posts_comply', label: t.delete },
					backUrl: base,
					errors: [],
				});
			const ok = await this.deps.moderation.deletePosts(topic, posts, isAdmin(viewer));
			if (!ok) return this.topicView(request, reply, forum, [t.adminPosts]);
			return reply.redirect(`viewtopic.php?id=${topic.id}`, 303);
		}

		const targets = await this.deps.moderation.listTargetForums(viewer.group.id);
		const subject = punTrim(field(body, 'new_subject'));
		const targetForum = positiveInt(field(body, 'move_to_forum'));
		const splitForm = (errors: string[]) =>
			this.renderForm(request, reply, {
				title: t.splitPosts,
				legend: t.confirmSplitLegend,
				text: t.splitPostsComply,
				action: base,
				hidden,
				forums: buildForumChoice(targets, null, targetForum > 0 ? targetForum : forum.id),
				subject,
				redirect: null,
				submit: { name: 'split_posts_comply', label: t.split },
				backUrl: base,
				errors,
			});
		if (body.split_posts_comply === undefined) return splitForm([]);
		if (subject === '') return splitForm([t.subjectRequired]);
		if ([...subject].length > MAX_SUBJECT_LENGTH) return splitForm([t.subjectTooLong]);

		const newTopicId = await this.deps.moderation.splitPosts(topic, posts, targetForum, subject, viewer.group.id);
		if (newTopicId === null) return this.badRequest(request, reply);
		return reply.redirect(`viewtopic.php?id=${newTopicId}`, 303);
	}

	// ——— Sujets du forum ———

	private async moveForm(
		request: ModerateRequest,
		reply: FastifyReply,
		forum: ForumInfo,
		topics: readonly number[],
		single: boolean,
		errors: string[],
	): Promise<FastifyReply> {
		const t = this.deps.page.lang.moderate;
		const targets = (await this.deps.moderation.listTargetForums(request.viewer.group.id)).filter((target) => target.forumId !== forum.id);
		if (targets.length === 0) return renderMessage(request, reply, this.deps, 200, t.nowhereToMove);
		return this.renderForm(request, reply, {
			title: single ? t.moveTopic : t.moveTopics,
			legend: t.moveLegend,
			text: null,
			action: `moderate.php?fid=${forum.id}`,
			hidden: [{ name: 'topics', value: topics.join(',') }],
			forums: buildForumChoice(targets, forum.id, null),
			subject: null,
			// Un lien de redirection est proposé coché pour un sujet seul, comme le PHP.
			redirect: { checked: single },
			submit: { name: 'move_topics_to', label: t.move },
			backUrl: `moderate.php?fid=${forum.id}`,
			errors,
		});
	}

	private async moveTopics(request: ModeratePost, reply: FastifyReply, forum: ForumInfo): Promise<FastifyReply> {
		const { body, viewer } = request;
		const t = this.deps.page.lang.moderate;
		const topics = idList(body, 'topics');
		if (topics.length === 0) return this.forumView(request, reply, forum, [t.noTopicsSelected]);
		if (body.move_topics_to === undefined) return this.moveForm(request, reply, forum, topics, false, []);

		const target = positiveInt(field(body, 'move_to_forum'));
		const ok = await this.deps.moderation.moveTopics(forum.id, topics, target, body.with_redirect !== undefined, viewer.group.id);
		if (!ok) return this.badRequest(request, reply);
		return reply.redirect(`viewforum.php?id=${target}`, 303);
	}

	private async mergeTopics(request: ModeratePost, reply: FastifyReply, forum: ForumInfo): Promise<FastifyReply> {
		const { body } = request;
		const t = this.deps.page.lang.moderate;
		const topics = idList(body, 'topics');
		if (topics.length < 2) return this.forumView(request, reply, forum, [t.notEnoughTopics]);
		if (body.merge_topics_comply === undefined)
			return this.renderForm(request, reply, {
				title: t.mergeTopics,
				legend: t.confirmMergeLegend,
				text: null,
				action: `moderate.php?fid=${forum.id}`,
				hidden: [{ name: 'topics', value: topics.join(',') }],
				forums: null,
				subject: null,
				redirect: { checked: false },
				submit: { name: 'merge_topics_comply', label: t.merge },
				backUrl: `moderate.php?fid=${forum.id}`,
				errors: [],
			});
		const merged = await this.deps.moderation.mergeTopics(forum.id, topics, body.with_redirect !== undefined);
		if (merged === null) return this.badRequest(request, reply);
		return reply.redirect(`moderate.php?fid=${forum.id}&done=merged`, 303);
	}

	private async deleteTopics(request: ModeratePost, reply: FastifyReply, forum: ForumInfo): Promise<FastifyReply> {
		const { body, viewer } = request;
		const t = this.deps.page.lang.moderate;
		const topics = idList(body, 'topics');
		if (topics.length === 0) return this.forumView(request, reply, forum, [t.noTopicsSelected]);
		if (body.delete_topics_comply === undefined)
			return this.renderForm(request, reply, {
				title: t.deleteTopics,
				legend: t.confirmDeleteLegend,
				text: t.deleteTopicsComply,
				action: `moderate.php?fid=${forum.id}`,
				hidden: [{ name: 'topics', value: topics.join(',') }],
				forums: null,
				subject: null,
				redirect: null,
				submit: { name: 'delete_topics_comply', label: t.delete },
				backUrl: `moderate.php?fid=${forum.id}`,
				errors: [],
			});
		const result = await this.deps.moderation.deleteTopics(forum.id, topics, isAdmin(viewer));
		if (result === 'adminPosts') return this.forumView(request, reply, forum, [t.adminPosts]);
		if (result === 'invalid') return this.badRequest(request, reply);
		return reply.redirect(`moderate.php?fid=${forum.id}&done=deleted`, 303);
	}

	// ——— Actions sur un seul sujet ———

	/** Libellé de l'action, pour la confirmation d'un ancien lien GET. */
	private singleLabel(action: SingleAction): string {
		const t = this.deps.page.lang.common;
		const labels: Record<SingleAction, string> = {
			open: t.openTopic,
			close: t.closeTopic,
			stick: t.stickTopic,
			unstick: t.unstickTopic,
			balise: t.addLabel(''),
			nobalise: t.removeLabel(''),
		};
		return labels[action].trim();
	}

	private confirmSingle(
		request: ModerateRequest,
		reply: FastifyReply,
		single: { action: SingleAction; topicId: number },
	): Promise<FastifyReply> {
		if (single.topicId < 1) return this.badRequest(request, reply);
		const search = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
		const label = this.singleLabel(single.action);
		return this.renderForm(request, reply, {
			title: label,
			legend: label,
			text: null,
			action: `moderate.php${search}`,
			hidden: [],
			forums: null,
			subject: null,
			redirect: null,
			submit: { name: 'confirm', label },
			backUrl: `viewtopic.php?id=${single.topicId}`,
			errors: [],
		});
	}

	private async applySingle(
		request: ModeratePost,
		reply: FastifyReply,
		forum: ForumInfo,
		single: { action: SingleAction; topicId: number; labelId: number },
	): Promise<FastifyReply> {
		const { topicId, labelId, action } = single;
		if (topicId < 1) return this.badRequest(request, reply);
		const store = this.deps.moderation;
		let ok = true;
		if (action === 'open' || action === 'close') await store.setClosed(forum.id, [topicId], action === 'close');
		else if (action === 'stick' || action === 'unstick') ok = await store.setSticky(forum.id, topicId, action === 'stick');
		else ok = await store.setTopicLabel(forum.id, topicId, labelId, action === 'balise');
		if (!ok) return this.badRequest(request, reply);
		return reply.redirect(`viewtopic.php?id=${topicId}`, 303);
	}

	private renderForm(request: FastifyRequest, reply: FastifyReply, view: ModerateFormView): Promise<FastifyReply> {
		const { lang } = this.deps.page;
		return renderPage(
			request,
			reply,
			this.deps,
			'moderate_form.njk',
			{ pageId: 'moderate', titleParts: [request.board.boardTitle, lang.moderate.moderate, view.title], activeNav: 'index' },
			view,
		);
	}
}
