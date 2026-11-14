/**
 * « J'aime » et réactions émoji sur les messages : liste fixe, saisie, droits, effet d'un clic.
 */

import type { BoardConfig, Viewer } from '../domain/models.ts';

/** Le « J'aime » porte le 👍 : les réactions sont les autres émojis. */
export const LIKE_EMOJI = '👍';
export const REACTIONS = ['heart', 'laugh', 'wow', 'thanks', 'party'] as const;
export type ReactionKey = (typeof REACTIONS)[number];
export const REACTION_EMOJIS: Readonly<Record<ReactionKey, string>> = {
	heart: '❤️',
	laugh: '😂',
	wow: '😮',
	thanks: '🙏',
	party: '🎉',
};

/** Ce qu'envoie un bouton : le « J'aime », ou une réaction. */
export type ReactionChoice = { kind: 'like' } | { kind: 'emoji'; reaction: ReactionKey };

export function readReactionChoice(value: string): ReactionChoice | null {
	if (value === 'like') return { kind: 'like' };
	return (REACTIONS as readonly string[]).includes(value) ? { kind: 'emoji', reaction: value as ReactionKey } : null;
}

/** Compteurs d'un message, et ce qu'a choisi le lecteur. */
export interface PostReactions {
	likes: number;
	reactions: Readonly<Partial<Record<ReactionKey, number>>>;
	liked: boolean;
	reaction: ReactionKey | null;
}

export const NO_REACTIONS: PostReactions = { likes: 0, reactions: {}, liked: false, reaction: null };

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
