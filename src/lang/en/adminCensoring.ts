/**
 * English translation of src/lang/fr/adminCensoring.ts (admin_censoring.php).
 */

import type { adminCensoring as frAdminCensoring } from '../fr/adminCensoring.ts';

export const adminCensoring: typeof frAdminCensoring = {
	title: 'Censoring',
	mustEnterWord: 'You must enter a word to censor.',
	wordAdded: 'Censored word added.',
	wordUpdated: 'Censored word updated.',
	wordRemoved: 'Censored word removed.',
	addWordSubhead: 'Add word',
	addWordInfo:
		'Enter a word you want to censor and the replacement text for it. Wildcards are accepted (e.g. *some* matches “awesome” and “something”). Usernames are also censored. New members cannot register with a username containing a censored word. Matching is case-insensitive.',
	enabled: 'Censoring is enabled in',
	disabled: 'Censoring is disabled in',
	options: 'Options',
	censoredWord: 'Censored word',
	replacement: 'Replacement word(s)',
	add: 'Add',
	update: 'Update',
	remove: 'Remove',
	editRemoveSubhead: 'Edit or remove words',
	noWords: 'No censored words yet.',
	wordLabel: (word: string) => `Censored word “${word}”`,
	replacementLabel: (word: string) => `Replacement for “${word}”`,
};
