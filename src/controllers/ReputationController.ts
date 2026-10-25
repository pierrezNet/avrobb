/**
 * Contrôleur de reputation.php (mod Reputation de PV) : historique des votes reçus par un membre
 * (?uid=), formulaire de vote (?pid=&uid=&method=1|2), enregistrement, et suppression de votes par
 * les administrateurs et modérateurs.
 *
 * Écarts assumés : le vote vise un message identifié par son numéro (le PHP recherchait aussi
 * l'auteur par son pseudo, reçu d'un champ caché et inséré tel quel dans la requête SQL) ; la
 * suppression de votes ne déclenche plus l'e-mail codé en dur à l'administrateur ; erreurs
 * réaffichées dans le formulaire.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildReputationPage, buildVoteForm } from '../presenters/reputationPage.ts';
import type { CensorReader } from '../repositories/CensorRepository.ts';
import type { ReputationStore } from '../repositories/ReputationRepository.ts';
import { buildCensor } from '../services/censor.ts';
import { pageCount } from '../services/pagination.ts';
import { canDeleteReputation, readReason, reputationAccessError, voteError } from '../services/reputation.ts';
import { idList, positiveInt } from './params.ts';

export interface ReputationControllerDeps extends LayoutDeps {
	reputation: ReputationStore;
	censorship: CensorReader;
}

export interface ReputationQuery {
	uid?: string;
	pid?: string;
	method?: string;
	p?: string;
	done?: string;
}

type ReputationRequest = FastifyRequest<{ Querystring: ReputationQuery; Body?: FormBody }>;
type ReputationPost = FastifyRequest<{ Querystring: ReputationQuery; Body: FormBody }>;

/** Sens du vote : 1 = positif, 2 = négatif ; null si invalide. */
function voteDirection(method: string | undefined): boolean | null {
	return method === '1' ? true : method === '2' ? false : null;
}

export class ReputationController {
	constructor(private readonly deps: ReputationControllerDeps) {}

	show = async (request: ReputationRequest, reply: FastifyReply): Promise<FastifyReply> => {
		const denied = this.denied(request, reply);
		if (denied !== null) return denied;
		return request.query.method === undefined ? this.history(request, reply, []) : this.voteForm(request, reply);
	};

	submit = async (request: ReputationPost, reply: FastifyReply): Promise<FastifyReply> => {
		const denied = this.denied(request, reply);
		if (denied !== null) return denied;
		return request.body.delete_rep !== undefined ? this.deleteVotes(request, reply) : this.vote(request, reply);
	};

	private denied(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> | null {
		const error = reputationAccessError(request.viewer, request.board);
		return error !== null ? renderMessage(request, reply, this.deps, 403, this.deps.page.lang.reputation.accessError(error)) : null;
	}

	private async history(request: ReputationRequest, reply: FastifyReply, errors: string[]): Promise<FastifyReply> {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		const member = await this.deps.reputation.findMember(positiveInt(request.query.uid));
		if (member === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);

		const perPage = viewer.postsPerPage ?? config.defaultPostsPerPage;
		const numPages = pageCount(await this.deps.reputation.countVotes(member.id), perPage);
		const requested = positiveInt(request.query.p);
		const page = requested >= 1 && requested <= numPages ? requested : 1;
		const [votes, censoredWords] = await Promise.all([
			this.deps.reputation.listVotes(member.id, (page - 1) * perPage, perPage),
			config.censoring ? this.deps.censorship.listWords() : [],
		]);

		const view = buildReputationPage({
			viewer,
			config,
			member,
			votes,
			page,
			numPages,
			canDelete: canDeleteReputation(viewer),
			censor: config.censoring ? buildCensor(censoredWords) : null,
			lang,
			dateWords: this.deps.page.dateWords,
			now: this.deps.page.clock(),
			notice: request.query.done === 'deleted' ? lang.reputation.deleted : null,
			errors,
		});
		return renderPage(
			request,
			reply,
			this.deps,
			'reputation.njk',
			{
				pageId: 'reputation',
				titleParts: [config.boardTitle, lang.reputation.reputation, member.username],
				pageNumber: page > 1 ? page : null,
			},
			view,
		);
	}

	/** Contrôles communs au formulaire et à l'enregistrement d'un vote ; renvoie la cible ou une réponse d'erreur. */
	private async checkVote(
		request: ReputationRequest,
		reply: FastifyReply,
		postId: number,
		plus: boolean | null,
		expectedAuthor: number | null,
	) {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		if (viewer.isGuest) return renderMessage(request, reply, this.deps, 403, lang.common.noPermission);
		const target = postId > 0 && plus !== null ? await this.deps.reputation.findTarget(postId, viewer.group.id) : null;
		if (target === null || plus === null || (expectedAuthor !== null && expectedAuthor !== target.authorId))
			return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);

		const error = voteError(viewer, target, plus, {
			lastVote: await this.deps.reputation.lastVoteTime(viewer.id, target.authorId),
			timeoutMinutes: config.reputationTimeout,
			now: this.deps.page.clock(),
		});
		if (error !== null) return renderMessage(request, reply, this.deps, 403, lang.reputation.voteError(error, config.reputationTimeout));
		return { target, plus };
	}

	private async voteForm(request: ReputationRequest, reply: FastifyReply): Promise<FastifyReply> {
		const { query } = request;
		const checked = await this.checkVote(request, reply, positiveInt(query.pid), voteDirection(query.method), positiveInt(query.uid));
		if (!('target' in checked)) return checked;
		return this.renderVoteForm(request, reply, checked.target.postId, checked.plus, checked.target.authorName, '', []);
	}

	private async vote(request: ReputationPost, reply: FastifyReply): Promise<FastifyReply> {
		const { viewer, board: config, body } = request;
		const { lang } = this.deps.page;
		const checked = await this.checkVote(request, reply, positiveInt(field(body, 'pid')), voteDirection(field(body, 'method')), null);
		if (!('target' in checked)) return checked;
		const { target, plus } = checked;

		const raw = field(body, 'req_message');
		const { reason, errors } = readReason(raw, {
			bbcode: config.bbcode,
			messageAllCaps: config.posting.messageAllCaps,
			preparse: {
				quoteDepth: config.posting.quoteDepth,
				makeLinks: config.posting.makeLinks,
				allowLinks: viewer.group.canPostLinks,
				indentSpaces: config.indentSpaces,
				baseUrl: config.baseUrl,
			},
		});
		if (errors.length > 0)
			return this.renderVoteForm(
				request,
				reply,
				target.postId,
				plus,
				target.authorName,
				raw,
				errors.map((e) => lang.reputation.reasonError(e)),
			);

		await this.deps.reputation.addVote({
			userId: target.authorId,
			fromUserId: viewer.id,
			postId: target.postId,
			topicId: target.topicId,
			reason,
			plus,
			time: this.deps.page.clock(),
		});
		return reply.redirect(`viewtopic.php?pid=${target.postId}#p${target.postId}`, 303);
	}

	private async deleteVotes(request: ReputationPost, reply: FastifyReply): Promise<FastifyReply> {
		const { lang } = this.deps.page;
		if (!canDeleteReputation(request.viewer)) return renderMessage(request, reply, this.deps, 403, lang.common.noPermission);
		const uid = positiveInt(request.query.uid);
		if (uid < 2) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
		const ids = idList(request.body, 'delete_rep_id');
		if (ids.length === 0) return this.history(request, reply, [lang.reputation.mustSelect]);

		await this.deps.reputation.deleteVotes(uid, ids);
		const page = positiveInt(request.query.p);
		return reply.redirect(`reputation.php?uid=${uid}${page > 1 ? `&p=${page}` : ''}&done=deleted`, 303);
	}

	private renderVoteForm(
		request: ReputationRequest,
		reply: FastifyReply,
		postId: number,
		plus: boolean,
		target: string,
		reason: string,
		errors: string[],
	): Promise<FastifyReply> {
		const { lang } = this.deps.page;
		const view = buildVoteForm({ viewer: request.viewer, postId, plus, target, reason, errors, lang });
		return renderPage(
			request,
			reply,
			this.deps,
			'reputation_vote.njk',
			{ pageId: 'reputation', titleParts: [request.board.boardTitle, lang.reputation.reputation] },
			view,
		);
	}
}
