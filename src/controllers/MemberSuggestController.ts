/**
 * Complètement des noms de membres (member_suggest.php?q=…, propre à Node) : réponse JSON lue par
 * public/js/mentions.js. Réservé aux membres qui peuvent consulter la liste des membres
 * (g_view_users), comme userlist.php ; aucune écriture.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { MemberSuggestReader } from '../repositories/MemberSuggestRepository.ts';

export interface MemberSuggestControllerDeps {
	memberSuggest: MemberSuggestReader;
}

export interface MemberSuggestQuery {
	q?: string;
}

/** Suggestions par requête. */
const LIMIT = 8;
/** Longueur maximale d'un nom de membre (register.php). */
const MAX_PREFIX = 25;

export class MemberSuggestController {
	constructor(private readonly deps: MemberSuggestControllerDeps) {}

	suggest = async (request: FastifyRequest<{ Querystring: MemberSuggestQuery }>, reply: FastifyReply): Promise<FastifyReply> => {
		const { viewer } = request;
		reply.header('Cache-Control', 'no-store');
		if (viewer.isGuest || !viewer.group.canViewUsers) return reply.code(403).send({ members: [] });
		const prefix = (request.query.q ?? '').trim();
		if (prefix === '' || [...prefix].length > MAX_PREFIX) return reply.send({ members: [] });
		return reply.send({ members: await this.deps.memberSuggest.suggestMembers(prefix, LIMIT) });
	};
}
