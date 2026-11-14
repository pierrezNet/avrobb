/**
 * Réactions sur les messages : liste fixe (👍 « J'aime » d'abord), saisie, droits, effet d'un clic,
 * résumé sous le message.
 */

import type { BoardConfig, Viewer } from '../domain/models.ts';

export const REACTIONS = ['like', 'heart', 'laugh', 'wow', 'sad', 'thanks', 'party'] as const;
export type ReactionKey = (typeof REACTIONS)[number];
export const REACTION_EMOJIS: Readonly<Record<ReactionKey, string>> = {
	like: '👍',
	heart: '❤️',
	laugh: '😂',
	wow: '😮',
	sad: '😢',
	thanks: '🙏',
	party: '🎉',
};

export function readReaction(value: string): ReactionKey | null {
	return (REACTIONS as readonly string[]).includes(value) ? (value as ReactionKey) : null;
}

/** Compteurs d'un message, réaction du lecteur, et qui a réagi. */
export interface PostReactions {
	counts: Readonly<Partial<Record<ReactionKey, number>>>;
	/** Réaction du lecteur, ou null. */
	mine: ReactionKey | null;
	/** Membres ayant réagi (une réaction chacun). */
	reactors: number;
	/** Derniers à avoir réagi, hors lecteur, du plus récent au plus ancien (RECENT_REACTORS au plus). */
	recent: readonly string[];
}

export const NO_REACTIONS: PostReactions = { counts: {}, mine: null, reactors: 0, recent: [] };

/** Noms cités dans le résumé sous un message (« A, B, C et 5 autres »). */
export const RECENT_REACTORS = 3;

/** Un membre réagit au message d'un autre ; un invité ne fait que voir le résumé. */
export function canReact(viewer: Viewer, authorId: number | null): boolean {
	return !viewer.isGuest && viewer.ban === null && authorId !== viewer.id;
}

/** Effet d'un clic : la réaction remplace la précédente, ou se retire si c'était déjà la même. */
export function nextReaction(current: ReactionKey | null, chosen: ReactionKey): ReactionKey | null {
	return current === chosen ? null : chosen;
}

/** Émojis reçus, du plus fréquent au moins fréquent, `max` au plus. */
export function topEmojis(reactions: PostReactions, max = 3): string[] {
	return REACTIONS.filter((key) => (reactions.counts[key] ?? 0) > 0)
		.sort((a, b) => (reactions.counts[b] ?? 0) - (reactions.counts[a] ?? 0))
		.slice(0, max)
		.map((key) => REACTION_EMOJIS[key]);
}

/** Noms du résumé : « vous » d'abord si le lecteur a réagi, puis les derniers ; le reste est compté. */
export function reactorNames(reactions: PostReactions, you: string): { names: string[]; others: number } {
	const names = [...(reactions.mine !== null ? [you] : []), ...reactions.recent].slice(0, RECENT_REACTORS);
	return { names, others: Math.max(0, reactions.reactors - names.length) };
}

/** Réactions affichées et acceptées (o_post_reactions). */
export const reactionsEnabled = (config: BoardConfig): boolean => config.postReactions;

/** Membre de la liste « Membres ayant réagi au message ». */
export interface Reactor {
	userId: number;
	username: string;
	reaction: ReactionKey;
	reactedAt: number;
}
