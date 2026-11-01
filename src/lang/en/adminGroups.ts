/**
 * English translation of src/lang/fr/adminGroups.ts: texts of admin_groups.php.
 */

import type { adminGroups as frAdminGroups } from '../fr/adminGroups.ts';

export const adminGroups: typeof frAdminGroups = {
	title: 'User groups',
	missingTitle: 'You must enter a group title.',
	cannotRemoveDefault: 'The default group cannot be removed. To remove this group, you must first set another group as the default.',
	addGroupsHead: 'Add/setup groups',
	addGroupSubhead: 'Add a new group',
	newGroupLabel: 'Base new group on',
	newGroupHelp:
		'Select a user group from which the new group will inherit its permissions. The next page will let you fine-tune its settings.',
	defaultGroupSubhead: 'Set the default group',
	defaultGroupLabel: 'Default group',
	defaultGroupHelp:
		'This is the default group, i.e. the group users are placed in when they register. For security reasons, users cannot be placed in the moderator or administrator groups by default.',
	existingGroupsHead: 'Existing groups',
	editGroupsInfo:
		'The predefined groups Guests, Administrators, Moderators and Members cannot be removed. They can, however, be edited. Please note that some options are not available in some groups (e.g. the edit posts permission for guests). Administrators always have full permissions.',
	edit: 'Edit',
	delete: 'Delete',
	groupDeleteHead: 'Delete group',
	confirmDeleteSubhead: 'Confirm group deletion',
	confirmDeleteWarn: 'WARNING! A deleted group cannot be restored.',
	moveUsersSubhead: 'Move users currently in this group',
	moveUsersLabel: 'Move users to',
	deleteGroup: 'Delete group',
	groupSettingsHead: 'Group settings',
	groupSettingsInfo:
		'The options and permissions below are the default permissions for this user group. They apply unless forum-specific permissions are in effect.',
	groupTitleLabel: 'Group title',
	userTitleLabel: 'User title',
	disablePromotion: 'Disable automatic promotion',
	promoteMinPostsLabel: 'Promote users.',
	moderatorInfo:
		'Please note that for a user in this group to get moderator privileges, they must be assigned to moderate one or more forums. This is done from the user administration page of the user’s profile.',
	titleExists: (title: string) => `There is already a group named “${title}”.`,
	confirmDeleteInfo: (title: string) => `Are you sure you want to delete the group “${title}”?`,
	moveUsersInfo: (title: string, count: number) =>
		`The group “${title}” currently has ${count === 1 ? '1 member' : `${count} members`}. Please choose a group its members will be assigned to after deletion.`,
	userTitleHelp: 'This title will override any title users would otherwise get in this group. Leave blank to use the default title.',
	promoteMinPosts: 'Posts required for promotion',
	added: 'Group added.',
	edited: 'Group edited.',
	removed: 'Group removed.',
	defaultSet: 'Default group set.',
	add: 'Add',
	save: 'Save',
	setDefault: 'Save',
	yes: 'Yes',
	no: 'No',
	goBack: 'Go back',
	fields: {
		g_promote_next_group: {
			label: 'Promote users.',
			help: 'You can automatically promote users to a new group once they reach a certain number of posts. Select “Disable automatic promotion” to turn this off. For security reasons, you cannot select an administrator group. Group changes for users affected by this setting take effect immediately. Note that the number of posts you enter is the user’s total post count, not the number of posts made as a member of this group.',
		},
		g_moderator: {
			label: 'Grant moderator privileges to users',
			help: 'For a user in this group to get moderator privileges, they must be assigned to moderate one or more forums. This is done from the user administration page of the user’s profile.',
		},
		g_mod_edit_users: {
			label: 'Allow moderators to edit user profiles',
			help: 'If moderator privileges are enabled, allow users in this group to edit user profiles.',
		},
		g_mod_rename_users: {
			label: 'Allow moderators to rename users',
			help: 'If moderator privileges are enabled, allow users in this group to rename users.',
		},
		g_mod_change_passwords: {
			label: 'Allow moderators to change passwords',
			help: 'If moderator privileges are enabled, allow users in this group to change user passwords.',
		},
		g_mod_ban_users: {
			label: 'Allow moderators to ban users',
			help: 'If moderator privileges are enabled, allow users in this group to ban users.',
		},
		g_read_board: {
			label: 'Read board',
			help: 'Allow users in this group to view the board. This setting applies to every part of the board and therefore cannot be overridden by forum-specific settings. If set to “No”, users in this group will only be able to log in/out and register.',
		},
		g_view_users: {
			label: 'View user information',
			help: 'Allow users to view the user list and user profiles.',
		},
		g_post_replies: { label: 'Post replies', help: 'Allow users in this group to post replies in topics.' },
		g_post_topics: { label: 'Post topics', help: 'Allow users in this group to post new topics.' },
		g_edit_posts: { label: 'Edit posts', help: 'Allow users in this group to edit their own posts.' },
		g_delete_posts: {
			label: 'Delete posts',
			help: 'Allow users in this group to delete their own posts.',
		},
		g_delete_topics: {
			label: 'Delete topics',
			help: 'Allow users in this group to delete their own topics (including any replies).',
		},
		g_post_links: {
			label: 'Post links',
			help: 'Allow users in this group to include links in their posts. This setting also applies to signatures and the website field in user profiles.',
		},
		g_set_title: {
			label: 'Set own user title',
			help: 'Allow users in this group to set their own user title.',
		},
		g_search: { label: 'Use search', help: 'Allow users in this group to use the search feature.' },
		g_search_users: {
			label: 'Search user list',
			help: 'Allow users in this group to search the user list by free text.',
		},
		g_send_email: {
			label: 'Send emails',
			help: 'Allow users in this group to send emails to other users.',
		},
		g_post_flood: {
			label: 'Post flood interval',
			help: 'Number of seconds users in this group must wait between posts. Set to 0 to disable.',
		},
		g_search_flood: {
			label: 'Search flood interval',
			help: 'Number of seconds users in this group must wait between searches. Set to 0 to disable.',
		},
		g_email_flood: {
			label: 'Email flood interval',
			help: 'Number of seconds users in this group must wait between emails. Set to 0 to disable.',
		},
		g_report_flood: {
			label: 'Report flood interval',
			help: 'Number of seconds users in this group must wait between reports. Set to 0 to disable.',
		},
		g_promote_min_posts: { label: 'Posts required for promotion', help: null },
	} as Record<string, { label: string; help: string | null }>,
};
