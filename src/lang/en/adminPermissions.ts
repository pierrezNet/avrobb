/**
 * English translation of src/lang/fr/adminPermissions.ts (admin_permissions.php).
 */

import type { adminPermissions as frAdminPermissions } from '../fr/adminPermissions.ts';

export const adminPermissions: typeof frAdminPermissions = {
	title: 'Permissions',
	sections: {
		posting: 'Posting',
		signatures: 'Signatures',
		registration: 'Registration',
	},
	fields: {
		message_bbcode: { label: 'BBCode', help: 'Allow BBCode in posts (recommended).' },
		message_img_tag: { label: 'Image tag', help: 'Allow the BBCode [img][/img] tag in posts.' },
		message_all_caps: {
			label: 'All-caps posts',
			help: 'Allow a post to be written entirely in capital letters.',
		},
		subject_all_caps: {
			label: 'All-caps subjects',
			help: 'Allow a subject to be written entirely in capital letters.',
		},
		force_guest_email: {
			label: 'Require guest e-mail',
			help: 'Require guests to enter an e-mail address to post.',
		},
		sig_bbcode: { label: 'BBCode in signatures', help: 'Allow BBCode in member signatures.' },
		sig_img_tag: {
			label: 'Image tag in signatures',
			help: 'Allow the BBCode [img][/img] tag in member signatures (not recommended).',
		},
		sig_all_caps: {
			label: 'All-caps signatures',
			help: 'Allow a signature to be written entirely in capital letters.',
		},
		sig_length: {
			label: 'Maximum signature length',
			help: 'Maximum number of characters in a member signature.',
		},
		sig_lines: { label: 'Maximum signature lines', help: 'Maximum number of lines in a member signature.' },
		allow_banned_email: {
			label: 'Allow banned e-mail addresses',
			help: 'Allow banned e-mail addresses or domains when members register or change their e-mail. If left at the default (yes), this is allowed, but a warning e-mail is sent to the mailing list (an effective way to spot multiple registrations).',
		},
		allow_dupe_email: {
			label: 'Allow duplicate e-mail addresses',
			help: 'Whether members may register with an e-mail address already used by another registered member. If allowed, a warning e-mail is sent to the mailing list when a duplicate is detected.',
		},
	} as Record<string, { label: string; help: string | null }>,
	updated: 'Permissions updated.',
};
