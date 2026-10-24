/**
 * Contrôleur de edit.php : modification d'un message (et du sujet s'il l'ouvre), prévisualisation,
 * enregistrement avec mise à jour de l'index de recherche.
 *
 * Comme le PHP, le formulaire présente le texte déjà censuré : l'enregistrer conserve la censure.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { BoardConfig, EditablePost } from '../domain/models.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildEditPage, type EditPageInput } from '../presenters/postPage.ts';
import type { BanReader } from '../repositories/BanRepository.ts';
import type { CensorReader } from '../repositories/CensorRepository.ts';
import type { PostEditStore } from '../repositories/PostEditRepository.ts';
import type { StopwordsReader } from '../repositories/StopwordsLoader.ts';
import type { ToolbarReader } from '../repositories/ToolbarRepository.ts';
import { buildCensor, type Censor } from '../services/censor.ts';
import { canEditPost, isAnyModerator, isForumModerator, ownershipOf } from '../services/permissions.ts';
import { validatePost } from '../services/posting.ts';
import { indexWords } from '../services/searchIndex.ts';
import { DEFAULT_TOOLBAR } from '../services/toolbar.ts';
import { positiveInt } from './params.ts';

export interface EditControllerDeps extends LayoutDeps {
	postEdits: PostEditStore;
	bans: BanReader;
	censorship: CensorReader;
	stopwords: StopwordsReader;
	toolbar: ToolbarReader;
}

export interface EditQuery {
	id?: string;
	action?: string;
}

type EditRequest = FastifyRequest<{ Querystring: EditQuery; Body?: FormBody }>;

const checked = (body: FormBody | undefined, name: string): boolean => body?.[name] !== undefined;

export class EditController {
	constructor(private readonly deps: EditControllerDeps) {}

	show = async (request: FastifyRequest<{ Querystring: EditQuery }>, reply: FastifyReply): Promise<FastifyReply> => {
		const post = await this.resolvePost(request, reply);
		if (!('topic' in post)) return post;
		const censor = await this.censor(request.board);
		const censored = (text: string): string => (censor !== null ? censor(text) : text);

		return this.renderForm(
			request,
			reply,
			post,
			censor,
			{
				subject: censored(post.topic.subject),
				message: censored(post.message),
				username: '',
				email: '',
				hideSmilies: post.hideSmilies,
				subscribe: false,
				stickTopic: post.topic.sticky,
				// Modification silencieuse cochée par défaut pour un modérateur, comme le PHP.
				silent: true,
			},
			[],
			null,
		);
	};

	submit = async (request: FastifyRequest<{ Querystring: EditQuery; Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> => {
		const { viewer, board: config, body } = request;
		const { lang } = this.deps.page;
		const post = await this.resolvePost(request, reply);
		if (!('topic' in post)) return post;

		const censor = await this.censor(config);
		const now = this.deps.page.clock();
		const isTopicPost = post.id === post.topic.firstPostId;
		const moderator = isForumModerator(viewer, post.forum);
		const preview = checked(body, 'preview');

		const result = validatePost(
			{
				subject: isTopicPost ? field(body, 'req_subject') : null,
				message: field(body, 'req_message'),
				username: '',
				email: '',
				hideSmilies: checked(body, 'hide_smilies'),
				subscribe: false,
				stickTopic: checked(body, 'stick_topic'),
				preview,
			},
			{
				viewer,
				now,
				isAnyModerator: isAnyModerator(viewer),
				isForumModerator: moderator,
				config: {
					bbcode: config.bbcode,
					subjectAllCaps: config.posting.subjectAllCaps,
					messageAllCaps: config.posting.messageAllCaps,
					forceGuestEmail: false,
					allowBannedEmail: true,
				},
				preparse: {
					quoteDepth: config.posting.quoteDepth,
					makeLinks: config.posting.makeLinks,
					indentSpaces: config.indentSpaces,
					baseUrl: config.baseUrl,
				},
				censor,
				bans: await this.deps.bans.listBans(),
				similarUsername: null,
				guestLabel: lang.common.guest,
				checkFlood: false,
			},
		);
		const silent = moderator && checked(body, 'silent');

		if (result.errors.length > 0 || preview) {
			const errors = result.errors.map((error) => lang.post.postError(error));
			return this.renderForm(
				request,
				reply,
				post,
				censor,
				{
					subject: field(body, 'req_subject'),
					message: result.originalMessage,
					username: '',
					email: '',
					hideSmilies: result.hideSmilies,
					subscribe: false,
					stickTopic: moderator ? checked(body, 'stick_topic') : post.topic.sticky,
					silent,
				},
				errors,
				errors.length === 0 ? result.message : null,
			);
		}

		await this.deps.postEdits.updatePost({
			postId: post.id,
			topicId: post.topic.id,
			message: result.message,
			hideSmilies: result.hideSmilies,
			edited: silent ? null : { at: now, by: viewer.username },
			// Seul un modérateur change l'épinglage ; sinon le sujet le garde.
			topic: isTopicPost ? { subject: result.subject, sticky: moderator ? result.stickTopic : post.topic.sticky } : null,
			words: indexWords(result.message, isTopicPost ? result.subject : null, await this.deps.stopwords.load()),
		});
		return reply.redirect(`viewtopic.php?pid=${post.id}#p${post.id}`);
	};

	/** Message lisible, et droit de le modifier. */
	private async resolvePost(request: EditRequest, reply: FastifyReply): Promise<EditablePost | FastifyReply> {
		const { viewer } = request;
		const { lang } = this.deps.page;
		if (!viewer.group.canReadBoard) return renderMessage(request, reply, this.deps, 403, lang.common.noView);

		const id = positiveInt(request.query.id);
		const post = id > 0 ? await this.deps.postEdits.findPost(id, viewer.group.id) : null;
		if (post === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
		if (!canEditPost(viewer, ownershipOf(post), this.deps.page.clock()))
			return renderMessage(request, reply, this.deps, 403, lang.common.noPermission);
		return post;
	}

	private async censor(config: BoardConfig): Promise<Censor | null> {
		return config.censoring ? buildCensor(await this.deps.censorship.listWords()) : null;
	}

	private async renderForm(
		request: EditRequest,
		reply: FastifyReply,
		post: EditablePost,
		censor: Censor | null,
		form: EditPageInput['form'],
		errors: string[],
		preview: string | null,
	): Promise<FastifyReply> {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		const view = buildEditPage({
			viewer,
			config,
			post,
			isForumModerator: isForumModerator(viewer, post.forum),
			form,
			errors,
			preview,
			toolbar: (await this.deps.toolbar.load()) ?? DEFAULT_TOOLBAR,
			censor,
			lang,
		});
		return renderPage(
			request,
			reply,
			this.deps,
			'post.njk',
			{ pageId: 'edit', titleParts: [config.boardTitle, view.heading], activeNav: 'index' },
			view,
		);
	}
}
