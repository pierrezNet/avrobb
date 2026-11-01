/**
 * English translation of src/lang/fr/adminMaintenance.ts (admin_maintenance.php texts).
 */

import type { adminMaintenance as frAdminMaintenance } from '../fr/adminMaintenance.ts';

export const adminMaintenance: typeof frAdminMaintenance = {
	title: 'Forum maintenance',
	coldSubhead: 'Old topics',
	coldInfo:
		'To separate recent content from old content without deleting anything: a topic with no new post for this many days leaves its forum list and moves to the forum’s “Old topics” page (button at the top of the list). Sticky topics always stay in the list. Search and links still find them.',
	coldDays: 'Age in days',
	coldDaysHelp: '0: all topics stay in the list.',
	coldDaysInvalid: 'The age must be a whole number of days.',
	coldSaved: 'Old topics threshold saved.',
	modeSubhead: 'Maintenance mode',
	modeInfo:
		'In maintenance mode, only administrators can use the forum; other visitors see the maintenance page with the message below. Administrators can still log in.',
	modeLabel: 'Maintenance mode',
	modeOn: 'On',
	modeOff: 'Off',
	modeMessage: 'Maintenance message',
	modeMessageHelp: 'May contain HTML. If left blank, a default message is used.',
	modeSave: 'Save',
	modePreview: 'Preview the maintenance page',
	modeEnabled: 'Maintenance mode is on: only administrators can access the forum.',
	modeDisabled: 'Maintenance mode is off.',
	previewNotice: 'Preview: this is the page members and guests see during maintenance.',
	backToMaintenance: 'Back to maintenance',
	rebuildSubhead: 'Rebuild search index',
	rebuildInfo:
		'If you added, edited or deleted posts manually in the database, or if you run into problems when searching, you should rebuild the search index. For best performance, put the forum in maintenance mode during the rebuild.',
	perCycle: 'Posts per cycle',
	perCycleHelp:
		'The number of posts to process in each step. E.g. if you enter 300, three hundred posts will be processed, then the next step will start. This keeps the process from being cut off midway.',
	startingPost: 'Starting post ID',
	startingPostHelp:
		'The post ID to start rebuilding from. The default is the first ID available in the database. Normally you shouldn’t need to change this.',
	emptyIndex: 'Empty index',
	emptyIndexHelp: 'Select this if you want the index to be emptied before the rebuild starts.',
	rebuildCompletedInfo:
		'Once the process is complete, you will be brought back to this page. With JavaScript, each step runs automatically; otherwise, click “Continue” at each step.',
	rebuild: 'Rebuild index',
	rebuilding: 'Rebuilding search index',
	rebuildingInfo: 'Rebuilding the index. Might be a good time to grab a coffee :-)',
	processed: (first: number, last: number) => `Posts ${first} to ${last} processed.`,
	continue: 'Continue',
	rebuilt: 'Search index rebuilt.',
	perCycleNotInteger: 'Posts per cycle must be a positive whole number.',
	goBack: 'Go back',
};
