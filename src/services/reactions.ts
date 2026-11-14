/**
 * « J'aime » et réactions émoji sur les messages : liste fixe, saisie, droits, effet d'un clic.
 */

import type { BoardConfig, Viewer } from '../domain/models.ts';

/** Le « J'aime » porte le 👍 : les réactions sont les autres émojis. */
export const LIKE_EMOJI = '👍';
export const REACTIONS = ['heart', 'laugh', 'wow', 'sad', 'thanks', 'party'] as const;
export type ReactionKey = (typeof REACTIONS)[number];
export const REACTION_EMOJIS: Readonly<Record<ReactionKey, string>> = {
	heart: '❤️',
	laugh: '😂',
	wow: '😮',
	sad: '😢',
	thanks: '🙏',
	party: '🎉',
};

/** Ce qu'envoie un bouton : le « J'aime », ou une réaction. */
export type ReactionChoice = { kind: 'like' } | { kind: 'emoji'; reaction: ReactionKey };

export function readReactionChoice(value: string): ReactionChoice | null {
	if (value === 'like') return { kind: 'like' };
	return (REACTIONS as readonly string[]).includes(value) ? { kind: 'emoji', reaction: value as ReactionKey } : null;
}

/** Compteurs d'un message, ce qu'a choisi le lecteur, et qui a réagi. */
export interface PostReactions {
	likes: number;
	reactions: Readonly<Partial<Record<ReactionKey, number>>>;
	liked: boolean;
	reaction: ReactionKey | null;
	/** Membres ayant aimé ou réagi (un membre compte une fois). */
	reactors: number;
	/** Derniers à avoir réagi, hors lecteur, du plus récent au plus ancien (RECENT_REACTORS au plus). */
	recent: readonly string[];
}

export const NO_REACTIONS: PostReactions = { likes: 0, reactions: {}, liked: false, reaction: null, reactors: 0, recent: [] };

/** Noms cités dans le résumé sous un message (« A, B, C et 5 autres »). */
export const RECENT_REACTORS = 3;

/** Émojis reçus, du plus fréquent au moins fréquent (le 👍 compte comme les autres), `max` au plus. */
export function topEmojis(counts: PostReactions, config: BoardConfig, max = 3): string[] {
	const found: { emoji: string; count: number }[] = [];
	if (config.postLikes && counts.likes > 0) found.push({ emoji: LIKE_EMOJI, count: counts.likes });
	if (config.postReactions)
		for (const key of REACTIONS) {
			const count = counts.reactions[key] ?? 0;
			if (count > 0) found.push({ emoji: REACTION_EMOJIS[key], count });
		}
	return found
		.sort((a, b) => b.count - a.count)
		.slice(0, max)
		.map((item) => item.emoji);
}

/** Noms du résumé : « vous » d'abord si le lecteur a réagi, puis les derniers ; le reste est compté. */
export function reactorNames(counts: PostReactions, you: string): { names: string[]; others: number } {
	const mine = counts.liked || counts.reaction !== null;
	const names = [...(mine ? [you] : []), ...counts.recent].slice(0, RECENT_REACTORS);
	return { names, others: Math.max(0, counts.reactors - names.length) };
}

/** Membre de la liste « Réactions au message ». */
export interface Reactor {
	userId: number;
	username: string;
	liked: boolean;
	reaction: ReactionKey | null;
	/** Dernier « J'aime » ou réaction, en secondes Unix. */
	reactedAt: number;
}

/** Fonction active dans les options (o_post_likes, o_post_reactions). */
export function reactionEnabled(config: BoardConfig, choice: ReactionChoice): boolean {
	return choice.kind === 'like' ? config.postLikes : config.postReactions;
}

/** Un membre réagit au message d'un autre ; un invité ne fait que voir les compteurs. */
export function canReact(viewer: Viewer, authorId: number | null): boolean {
	return !viewer.isGuest && viewer.ban === null && authorId !== viewer.id;
}

/**
 * Effet d'un clic : le « J'aime » s'ajoute ou se retire ; une réaction remplace la précédente, ou se
 * retire si c'était déjà la même (une seule réaction par membre et par message).
 */
export function nextReaction(current: PostReactions, choice: ReactionChoice): { liked: boolean; reaction: ReactionKey | null } {
	if (choice.kind === 'like') return { liked: !current.liked, reaction: current.reaction };
	return { liked: current.liked, reaction: current.reaction === choice.reaction ? null : choice.reaction };
}
