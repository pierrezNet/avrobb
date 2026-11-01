/**
 * English translation of src/lang/fr/adminPages.ts: admin page for info pages (admin_pages.php,
 * AvroBB only).
 */

import type { adminPages as frAdminPages } from '../fr/adminPages.ts';

export const adminPages: typeof frAdminPages = {
	title: 'Info pages',
	intro: 'The pages linked at the bottom of every forum page. Until a page is edited, it shows the text provided by AvroBB.',
	edit: 'Edit',
	view: 'View page',
	customized: 'Custom text',
	defaultText: 'Default text',
	editTitle: (page: string) => `Edit “${page}”`,
	pageTitle: 'Title',
	pageIntro: 'Introduction',
	pageIntroHelp: 'Text shown under the title (optional).',
	body: 'Content',
	bodyHelp:
		'“## Title” starts a section; a blank line separates two paragraphs; a “[Label](address)” line adds a link (a forum page such as faq.php, or an http(s) address). The text is shown as is, without HTML or BBCode.',
	save: 'Save',
	reset: 'Restore default text',
	resetHelp: 'Clears the changes made to this page.',
	saved: 'Page saved.',
	resetDone: 'The page shows the default text again.',
	errors: {
		title: 'The title is required (80 characters max).',
		intro: 'The introduction is too long (1,000 characters max).',
		body: 'The content must have at least one section (30,000 characters max).',
	} as Record<string, string>,
};
