/**
 * « J'aime » et réactions d'un message : barre sous le message (résumé, bouton « J'aime », palette
 * « Réagir »), réponse de react.php pour reactions.js, et liste des membres (reactions.php).
 * Fonctions pures.
 */

import type { BoardConfig, Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import {
	canReact,
	LIKE_EMOJI,
	type PostReactions,
	REACTION_EMOJIS,
	REACTIONS,
	type ReactionChoice,
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
	/** Bouton « J'aime » ; null si désactivé ou si le lecteur ne peut pas réagir. */
	like: { label: string; pressed: boolean } | null;
	/** Palette « Réagir » : émoji de la réaction choisie, ou 😊. */
	picker: { label: string; emoji: string; pressed: boolean; choices: ReactionChoiceView[] } | null;
	/** Liste des membres ayant réagi (lien du résumé). */
	reactorsHref: string;
	/** « 👍❤️ A, B et 5 autres » ; null si personne n'a réagi. */
	summary: { emojis: string; text: string } | null;
}

const PICKER_EMOJI = '😊';

type ReactionsInput = { viewer: Viewer; config: BoardConfig; lang: Lang };

export function reactionsView(postId: number, authorId: number | null, counts: PostReactions, input: ReactionsInput): ReactionsView | null {
	const { config, lang } = input;
	if (!config.postLikes && !config.postReactions) return null;
	const allowed = canReact(input.viewer, authorId);
	const emojis = topEmojis(counts, config);
	const { names, others } = reactorNames(counts, lang.topic.you);
	const view: ReactionsView = {
		formAction: 'react.php',
		postId,
		reactorsHref: `reactions.php?pid=${postId}`,
		like: allowed && config.postLikes ? { label: lang.topic.like, pressed: counts.liked } : null,
		picker:
			allowed && config.postReactions
				? {
						label: lang.topic.react,
						emoji: counts.reaction !== null ? REACTION_EMOJIS[counts.reaction] : PICKER_EMOJI,
						pressed: counts.reaction !== null,
						choices: REACTIONS.map((key) => ({
							value: key,
							emoji: REACTION_EMOJIS[key],
							label: lang.topic.reactions[key],
							pressed: counts.reaction === key,
						})),
					}
				: null,
		summary: emojis.length > 0 && names.length > 0 ? { emojis: emojis.join(''), text: lang.topic.reactorsSummary(names, others) } : null,
	};
	return view.like !== null || view.picker !== null || view.summary !== null ? view : null;
}

/** Onglet de la liste : « Tous », le « J'aime » ou une réaction reçue. */
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
	/** Émojis donnés : 👍 et la réaction. */
	emojis: string;
	/** Libellés des émojis, pour les lecteurs d'écran. */
	labels: string;
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
	post: { id: number; poster: string };
	counts: PostReactions;
	filter: ReactionChoice | null;
	reactors: readonly Reactor[];
	avatars: ReadonlyMap<number, string | null>;
	page: number;
	numPages: number;
	dateWords: DateWords;
	now: number;
}

/** Valeur du paramètre `r` d'un filtre. */
const filterValue = (filter: ReactionChoice | null): string | null =>
	filter === null ? null : filter.kind === 'like' ? 'like' : filter.reaction;

export function buildReactionsPage(input: ReactionsPageInput): ReactionsPageView {
	const { viewer, config, lang, counts, post } = input;
	const time = viewerTimeSettings(viewer);
	const base = `reactions.php?pid=${post.id}`;
	const current = filterValue(input.filter);
	const tab = (value: string | null, emoji: string | null, label: string, count: number): ReactorTabView => ({
		href: value === null ? base : `${base}&r=${value}`,
		emoji,
		label,
		count,
		current: value === current,
	});
	const tabs = [tab(null, null, lang.reactions.all, counts.reactors)];
	if (config.postLikes && counts.likes > 0) tabs.push(tab('like', LIKE_EMOJI, lang.topic.like, counts.likes));
	if (config.postReactions)
		for (const key of REACTIONS) {
			const count = counts.reactions[key] ?? 0;
			if (count > 0) tabs.push(tab(key, REACTION_EMOJIS[key], lang.topic.reactions[key], count));
		}

	return {
		title: lang.reactions.title(post.poster),
		postUrl: `viewtopic.php?pid=${post.id}#p${post.id}`,
		tabs,
		reactors: input.reactors.map((reactor) => {
			const given = [
				...(reactor.liked && config.postLikes ? [{ emoji: LIKE_EMOJI, label: lang.topic.like }] : []),
				...(reactor.reaction !== null && config.postReactions
					? [{ emoji: REACTION_EMOJIS[reactor.reaction], label: lang.topic.reactions[reactor.reaction] }]
					: []),
			];
			return {
				username: reactor.username,
				profileUrl: viewer.group.canViewUsers ? `profile.php?id=${reactor.userId}` : null,
				avatarUrl: input.avatars.get(reactor.userId) ?? null,
				initial: [...reactor.username][0]?.toUpperCase() ?? '?',
				emojis: given.map((item) => item.emoji).join(''),
				labels: given.map((item) => item.label).join(', '),
				at: formatTime(reactor.reactedAt, time, input.dateWords, input.now),
			};
		}),
		pagination: paginationLinks(input.numPages, input.page, (page) =>
			page > 1 ? `${base}${current !== null ? `&r=${current}` : ''}&p=${page}` : current !== null ? `${base}&r=${current}` : base,
		),
	};
}
