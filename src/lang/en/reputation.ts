/**
 * English translation of src/lang/fr/reputation.ts: reputation texts (reputation.php).
 */

import type { ReasonError, ReputationAccessError, VoteError } from '../../services/reputation.ts';
import type { reputation as frReputation } from '../fr/reputation.ts';
import { post } from './post.ts';

const ACCESS: Record<ReputationAccessError, string> = {
	groupDisabled: 'Your group cannot use the reputation system.',
	disabled: 'The reputation system is currently disabled',
	yourDisabled: 'You cannot use the reputation system because you turned it off in your profile.',
};

export const reputation: typeof frReputation = {
	reputation: 'Reputation',
	accessError: (error: ReputationAccessError) => ACCESS[error],
	voteError: (error: VoteError, timeoutMinutes: number): string => {
		switch (error) {
			case 'guest':
				return 'You are not allowed to view this page.';
			case 'self':
				return 'You cannot vote for yourself.';
			case 'userDisabled':
				return 'This member has turned reputation off.';
			case 'timeout':
				return timeoutMinutes === 1
					? 'Please wait 1 minute before voting again.'
					: `Please wait ${timeoutMinutes} minutes before voting again.`;
			case 'notEnoughPosts':
				return 'You do not have enough posts to change reputation.';
		}
	},
	reasonError: (error: ReasonError): string =>
		error.kind === 'noMessage'
			? 'A reason is required'
			: error.kind === 'tooLong'
				? 'Reason too long (400 characters max).'
				: post.preparseError(error.error),
	userReputation: (username: string) => `Reputation of ${username}`,
	totals: (plus: number, minus: number) => `[+${plus} / -${minus}]`,
	noReputation: 'No reputation',
	forTopic: 'Topic',
	removedOrDeleted: 'Removed or deleted',
	profileDeleted: 'Profile deleted',
	plusVote: 'Positive vote',
	minusVote: 'Negative vote',
	from: (name: string) => `from ${name}`,
	selectVote: (date: string) => `Select the vote of ${date}`,
	deleteSelected: 'Delete selected votes',
	areYouSure: 'Are you sure you want to delete these votes?',
	mustSelect: 'You must select some votes.',
	deleted: 'Votes deleted.',
	formHeader: 'Please fill in the form',
	formYourName: 'Your username',
	formToName: 'The member whose reputation will change',
	formReason: 'Reason for the reputation change',
	formMethod: 'Method',
	plus: 'Increase reputation',
	minus: 'Decrease reputation',
	reasonHelp: '400 characters max.',
	submit: 'Submit',
	errorsTitle: 'Errors',
	errorsInfo: 'The following errors need to be fixed:',
};
