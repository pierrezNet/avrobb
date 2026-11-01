/**
 * English translation of src/lang/fr/adminPlugins.ts: admin pages served by admin_loader.php
 * (subject tags and private messages).
 */

import type { adminPlugins as frAdminPlugins } from '../fr/adminPlugins.ts';

export const adminPlugins: typeof frAdminPlugins = {
	privateMessages: {
		title: 'Private messages',
		intro: 'Private message settings and message quotas per group.',
		settings: 'Settings',
		enabled: 'Enable private messages',
		enabledHelp: 'Turns the private message system on or off.',
		notification: 'Allow notifications',
		notificationHelp: 'Lets members choose to be notified by e-mail of new private messages.',
		maxReceivers: 'Number of recipients',
		maxReceiversHelp: 'The maximum number of recipients per private message.',
		permissions: 'Permissions',
		permissionsInfo:
			'Administrators and moderators can use private messages without limits. Guests, on the other hand, cannot use them at all. You can set permissions for the other groups below.',
		allowGroup: (group: string) => `Allow the ${group} group to use private messages`,
		limit: (group: string) => `Maximum number of messages in ${group} mailboxes (0: no limit)`,
		yes: 'Yes',
		no: 'No',
		save: 'Save',
		saved: 'Options updated.',
	},

	labels: {
		title: 'Tags',
		intro: 'Subject tags, chosen by the author, appear as colored badges in front of topic titles.',
		subjectTagsHead: 'Subject tags',
		subjectTagsInfo:
			'Offered to the author of a topic (form buttons, “Subject tags” page). A tag missing from this list is removed from the subject when it is saved.',
		groups: { project: 'Project', other: 'Other' } as Record<string, string>,
		addSubjectTag: 'Add a subject tag',
		subjectTagAddTitle: 'Add a subject tag',
		subjectTagEditTitle: 'Edit a subject tag',
		subjectTagName: 'Name',
		subjectTagNameHelp: '1 to 20 characters, no square brackets. Renaming a tag also renames it in existing subjects.',
		subjectTagGroup: 'Group',
		subjectTagColor: 'Background color',
		subjectTagColorHelp: 'The badge text switches to light or dark depending on the background, to stay readable.',
		moveUp: (name: string) => `Move ${name} up`,
		moveDown: (name: string) => `Move ${name} down`,
		subjectTagDeleteTitle: 'Delete a subject tag',
		subjectTagDeleteInfo: (name: string) =>
			`Delete the “${name}” tag? It will no longer be offered or shown; subjects that carry it will lose it the next time they are edited.`,
		subjectTagErrors: {
			name: 'The name must be 1 to 20 characters long, with no square brackets and no leading or trailing space.',
			color: 'Choose a color.',
			duplicate: 'A subject tag with this name already exists.',
		} as Record<string, string>,
		subjectTagSaved: 'Subject tag saved.',
		subjectTagRenamed: (count: number) =>
			count === 1 ? 'Subject tag saved and renamed in 1 subject.' : `Subject tag saved and renamed in ${count} subjects.`,
		subjectTagDeleted: 'Subject tag deleted.',
		save: 'Save',
		edit: 'Edit',
		delete: 'Delete',
		goBack: 'Go back',
	},
};
