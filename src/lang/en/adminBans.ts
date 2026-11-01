/**
 * English translation of src/lang/fr/adminBans.ts (admin_bans.php texts).
 */

import type { adminBans as frAdminBans } from '../fr/adminBans.ts';

export const adminBans: typeof frAdminBans = {
	title: 'Bans',
	noUser:
		'No user is registered with that username. If you want to add a ban that is not tied to a username, leave the username field blank.',
	noUserId: 'No registered user with that ID.',
	userIsAdmin: (username: string) =>
		`The user ${username} is an administrator and can't be banned. If you want to ban an administrator, you must first demote them.`,
	userIsMod: (username: string) =>
		`The user ${username} is a moderator and can't be banned. If you want to ban a moderator, you must first demote them.`,
	errors: {
		mustEnter: 'You must enter at least a username, an IP address or an email address.',
		guest: "A guest can't be banned.",
		invalidIp: 'You entered an invalid IP address or IP range.',
		invalidEmail: 'The email address (e.g. user@example.com) or email domain (e.g. example.com) you entered is invalid.',
		invalidDate: 'You entered an invalid expiry date. The format should be YYYY-MM-DD and the date must be later than today.',
	},
	invalidSearchDate: 'You entered an invalid expiry date.',
	added: 'Ban added.',
	edited: 'Ban updated.',
	removed: 'Ban removed.',
	newBanHead: 'New ban',
	username: 'Username',
	usernameAdvancedHelp:
		'The username to ban (case-insensitive). The next page lets you enter a custom IP and email. If you only want to ban an IP/IP range or an email, leave this field blank.',
	usernameHelp: 'The username to ban (case-insensitive).',
	add: 'Add',
	searchHead: 'Ban search',
	searchInfo:
		'Search for bans in the database. You can enter one or more terms to match. Wildcards in the form of asterisks (*) are accepted. To show all bans, leave every field blank.',
	dateHelp: '(yyyy-mm-dd)',
	message: 'Message',
	expireAfter: 'Expires after',
	expireBefore: 'Expires before',
	orderBy: 'Sort by',
	orders: { username: 'Username', ip: 'IP', email: 'Email', expire: 'Expiry date' } as Record<string, string>,
	direction: 'Order',
	ascending: 'Ascending',
	descending: 'Descending',
	submitSearch: 'Search',
	email: 'Email',
	emailHelp:
		'The email or email domain you want to ban (e.g. user@example.com or example.com). See “Allow banned email addresses” in the Permissions section for more information.',
	ip: 'IP address/IP ranges',
	ipHelp:
		'The IP address or IP range you want to ban (e.g. 150.11.110.1 or 150.11.110). Separate addresses with spaces. Leave blank to ban only the account.',
	banLastIp: (ip: string) => `Also ban their last known IP address (${ip})`,
	banLastIpHelp:
		'Useful if the member keeps creating new accounts. Warning: anyone using this address (same router, same company, same mobile network) will be banned too.',
	criteriaInfo: 'Each filled-in field is a criterion: ban an account (username), an IP address and/or an email, together or separately.',
	ipStatsLink: "Show this user's IP statistics",
	advancedHead: 'Advanced ban settings',
	advancedSubhead: 'Ban criteria',
	banMessage: 'Ban message',
	banMessageHelp: 'A message shown to the banned user on their next visit.',
	messageExpirySubhead: 'Ban message and expiry',
	ipRangeInfo: 'Be very careful when banning an IP range, since several users may share the same part of an IP address.',
	expireDate: 'Expiry date',
	expireDateHelp: 'The date on which this ban should automatically end (format: YYYY-MM-DD). Leave blank to remove it manually.',
	save: 'Save',
	resultsHead: 'Search results',
	expire: 'Expires',
	never: 'Never',
	bannedBy: 'Banned by',
	unknown: 'Unknown',
	noMatch: 'No match',
	edit: 'Edit',
	remove: 'Remove',
	confirmRemove: 'Remove this ban?',
	goBack: 'Go back',
};
