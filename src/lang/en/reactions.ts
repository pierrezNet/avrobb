/**
 * English translation of src/lang/fr/reactions.ts: members who reacted to a post (reactions.php).
 */

import type { reactions as frReactions } from '../fr/reactions.ts';

export const reactions: typeof frReactions = {
	title: (poster: string) => `Reactions to ${poster}’s post`,
	all: 'All',
	tabLabel: (label: string, count: number) => `${label} (${count})`,
	backToPost: 'Back to the post',
	nobody: 'Nobody has reacted to this post yet.',
	close: 'Close',
};
