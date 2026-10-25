/**
 * Modèles de vue de reputation.php : historique des votes reçus par un membre et formulaire de
 * vote. Fonctions pures.
 */

import type { BoardConfig, ReputationVote, Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { parseMessage } from '../services/bbcode.ts';
import type { Censor } from '../services/censor.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import { type PaginationLink, paginationLinks } from './navigation.ts';
import { messageParserOptions } from './parserOptions.ts';

export interface VoteView {
	id: number;
	plus: boolean;
	/** Lien vers le message noté, ou null si sa discussion n'existe plus. */
	post: { href: string; subject: string } | null;
	reasonHtml: string;
	/** Votant, avec un lien vers sa propre renommée ; null si son compte a été supprimé. */
	from: { href: string; label: string } | null;
	at: string;
	selectLabel: string;
}

export interface ReputationPageView {
	heading: string;
	totals: string;
	votes: VoteView[];
	pagination: PaginationLink[];
	/** Formulaire de suppression (administrateurs et modérateurs). */
	deleteAction: string | null;
	notice: string | null;
	errors: string[];
}

export function buildReputationPage(input: {
	viewer: Viewer;
	config: BoardConfig;
	member: { id: number; username: string; plus: number; minus: number };
	votes: readonly ReputationVote[];
	page: number;
	numPages: number;
	canDelete: boolean;
	censor: Censor | null;
	lang: Lang;
	dateWords: DateWords;
	now: number;
	notice: string | null;
	errors: string[];
}): ReputationPageView {
	const { viewer, config, member, lang, censor } = input;
	const t = lang.reputation;
	const pageUrl = (page: number): string => `reputation.php?uid=${member.id}${page > 1 ? `&p=${page}` : ''}`;
	return {
		heading: t.userReputation(member.username),
		totals: t.totals(member.plus, member.minus),
		votes: input.votes.map((vote) => {
			const at = formatTime(vote.time, viewerTimeSettings(viewer), input.dateWords, input.now);
			return {
				id: vote.id,
				plus: vote.plus,
				post:
					vote.subject !== null
						? { href: `viewtopic.php?pid=${vote.postId}#p${vote.postId}`, subject: censor !== null ? censor(vote.subject) : vote.subject }
						: null,
				// Raison rendue avec les émoticônes (parse_message($reason, 0) du PHP).
				reasonHtml: parseMessage(vote.reason, messageParserOptions(config, viewer, lang, censor)),
				from: vote.from !== null ? { href: `reputation.php?uid=${vote.from.id}`, label: vote.from.username } : null,
				at,
				selectLabel: t.selectVote(at),
			};
		}),
		pagination: paginationLinks(input.numPages, input.page, pageUrl),
		deleteAction: input.canDelete && input.votes.length > 0 ? pageUrl(input.page) : null,
		notice: input.notice,
		errors: input.errors,
	};
}

export interface VoteFormView {
	formAction: string;
	postId: number;
	method: 1 | 2;
	voter: string;
	target: string;
	methodLabel: string;
	reason: string;
	errors: string[];
}

export function buildVoteForm(input: {
	viewer: Viewer;
	postId: number;
	plus: boolean;
	target: string;
	reason: string;
	errors: string[];
	lang: Lang;
}): VoteFormView {
	const t = input.lang.reputation;
	return {
		formAction: 'reputation.php',
		postId: input.postId,
		method: input.plus ? 1 : 2,
		voter: input.viewer.username,
		target: input.target,
		methodLabel: input.plus ? t.plus : t.minus,
		reason: input.reason,
		errors: input.errors,
	};
}
