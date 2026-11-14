/**
 * Réactions d'un message : barre sous le message (résumé, palette « Réagir »), réponse de react.php
 * pour reactions.js, et liste des membres ayant réagi (reactions.php). Fonctions pures.
 */

import type { BoardConfig, Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import {
	canReact,
	type PostReactions,
	REACTION_EMOJIS,
	REACTIONS,
	type ReactionKey,
	type Reactor,
	reactorNames,
	topEmojis,
} from '../services/reactions.ts';
import { type PaginationLink, paginationLinks } from './navigation.ts';

/** Une réaction de la palette : `value` envoyé à react.php. */
export interface ReactionChoiceView {
	value: string;
	emoji: string;
	label: string;
	pressed: boolean;
}

export interface ReactionsView {
	formAction: string;
	postId: number;
	/** Liste des membres ayant réagi (lien du résumé). */
	reactorsHref: string;
	/** Palette « Réagir » : le bouton montre la réaction du lecteur, ou 😊 ; null s'il ne peut pas réagir. */
	picker: { label: string; emoji: string; pressed: boolean; choices: ReactionChoiceView[] } | null;
	/** « 👍❤️ A, B et 5 autres » ; null si personne n'a réagi. */
	summary: { emojis: string; text: string } | null;
}

const PICKER_EMOJI = '😊';

type ReactionsInput = { viewer: Viewer; config: BoardConfig; lang: Lang };

export function reactionsView(
	postId: number,
	authorId: number | null,
	reactions: PostReactions,
	input: ReactionsInput,
): ReactionsView | null {
	const { config, lang } = input;
	if (!config.postReactions) return null;
	const { mine } = reactions;
	const { names, others } = reactorNames(reactions, lang.topic.you);
	const view: ReactionsView = {
		formAction: 'react.php',
		postId,
		reactorsHref: `reactions.php?pid=${postId}`,
		picker: canReact(input.viewer, authorId)
			? {
					label: mine !== null ? lang.topic.reactions[mine] : lang.topic.react,
					emoji: mine !== null ? REACTION_EMOJIS[mine] : PICKER_EMOJI,
					pressed: mine !== null,
					choices: REACTIONS.map((key) => ({
						value: key,
						emoji: REACTION_EMOJIS[key],
						label: lang.topic.reactions[key],
						pressed: mine === key,
					})),
				}
			: null,
		summary:
			reactions.reactors > 0 && names.length > 0
				? { emojis: topEmojis(reactions).join(''), text: lang.topic.reactorsSummary(names, others) }
				: null,
	};
	return view.picker !== null || view.summary !== null ? view : null;
}

/** Onglet de la liste : « Tous » ou une réaction reçue. */
export interface ReactorTabView {
	href: string;
	emoji: string | null;
	label: string;
	count: number;
	current: boolean;
}

export interface ReactorView {
	username: string;
	profileUrl: string | null;
	avatarUrl: string | null;
	initial: string;
	emoji: string;
	label: string;
	at: string;
}

export interface ReactionsPageView {
	title: string;
	postUrl: string;
	tabs: ReactorTabView[];
	reactors: ReactorView[];
	pagination: PaginationLink[];
}

export interface ReactionsPageInput extends ReactionsInput {
	post: { id: number; number: number };
	reactions: PostReactions;
	filter: ReactionKey | null;
	reactors: readonly Reactor[];
	avatars: ReadonlyMap<number, string | null>;
	page: number;
	numPages: number;
	dateWords: DateWords;
	now: number;
}

export function buildReactionsPage(input: ReactionsPageInput): ReactionsPageView {
	const { viewer, lang, reactions, post, filter } = input;
	const time = viewerTimeSettings(viewer);
	const base = `reactions.php?pid=${post.id}`;
	const filtered = filter !== null ? `${base}&r=${filter}` : base;
	const tab = (key: ReactionKey | null, count: number): ReactorTabView => ({
		href: key !== null ? `${base}&r=${key}` : base,
		emoji: key !== null ? REACTION_EMOJIS[key] : null,
		label: key !== null ? lang.topic.reactions[key] : lang.reactions.all,
		count,
		current: key === filter,
	});

	return {
		title: lang.reactions.title(post.number),
		postUrl: `viewtopic.php?pid=${post.id}#p${post.id}`,
		tabs: [
			tab(null, reactions.reactors),
			...REACTIONS.filter((key) => (reactions.counts[key] ?? 0) > 0).map((key) => tab(key, reactions.counts[key] ?? 0)),
		],
		reactors: input.reactors.map((reactor) => ({
			username: reactor.username,
			profileUrl: viewer.group.canViewUsers ? `profile.php?id=${reactor.userId}` : null,
			avatarUrl: input.avatars.get(reactor.userId) ?? null,
			initial: [...reactor.username][0]?.toUpperCase() ?? '?',
			emoji: REACTION_EMOJIS[reactor.reaction],
			label: lang.topic.reactions[reactor.reaction],
			at: formatTime(reactor.reactedAt, time, input.dateWords, input.now),
		})),
		pagination: paginationLinks(input.numPages, input.page, (page) => (page > 1 ? `${filtered}&p=${page}` : filtered)),
	};
}
