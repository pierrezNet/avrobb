/**
 * English translation of src/lang/fr/toolbar.ts: BBCode toolbar texts. Tooltips show the tag syntax;
 * questions are asked in a dialog (js/toolbar.js).
 */

import type { toolbar as frToolbar } from '../fr/toolbar.ts';

export const toolbar: typeof frToolbar = {
	label: 'Post formatting',
	buttons: {
		smilies: 'Click here to show the smiley bar',
		bold: 'Bold text: [b]text[/b]',
		italic: 'Italic text: [i]text[/i]',
		underline: 'Underlined text: [u]text[/u]',
		strike: 'Strikethrough text: [s]text[/s]',
		color: 'Text color: [color=#000000]text[/color]',
		heading: 'Heading: [h]text[/h]',
		quote: 'Quote block: [quote=user]text[/quote]',
		code: 'Preformatted text: [code]text[/code]',
		link: 'Link: [url=http://www.website.ltd/]a website[/url]',
		img: 'Image: [img=text]http://www.website.ltd/url-image.png[/img]',
		email: 'E-mail: [email=name@host.ltd]email[/email]',
		list: 'List: [list=*,1,a]text[/list]',
		li: 'List item: [*]text[/*]',
		acronym: 'Acronym: [acronym=World Wide Web Consortium]W3C[/acronym]',
		q: 'Inline quote: [q]text[/q]',
		sup: 'Superscript: [sup]text[/sup]',
		sub: 'Subscript: [sub]text[/sub]',
		left: 'Align left: [left]text[/left]',
		right: 'Align right: [right]text[/right]',
		center: 'Center: [center]text[/center]',
		justify: 'Justify: [justify]text[/justify]',
		video: 'Video: [video]video[/video]',
	} as Readonly<Record<string, string>>,
	/** Dialogs of the buttons that ask questions (js/toolbar.js), fields in the order of services/toolbar.ts. */
	dialogs: {
		submit: 'Insert',
		cancel: 'Cancel',
		byButton: {
			link: {
				title: 'Insert a link',
				fields: [{ label: 'Link address' }, { label: 'Text shown', hint: 'Optional: the address is shown otherwise.' }],
			},
			email: {
				title: 'Insert an e-mail address',
				fields: [{ label: 'E-mail address' }, { label: 'Text shown', hint: 'Optional: the address is shown otherwise.' }],
			},
			img: {
				title: 'Insert an image from its address',
				fields: [
					{ label: 'Image address' },
					{ label: 'Image description', hint: 'Optional: read instead of the image by screen readers.' },
				],
			},
			quote: { title: 'Insert a quote', fields: [{ label: 'Quoted author', hint: 'Optional.' }] },
			list: {
				title: 'Insert a list',
				fields: [{ label: 'List type', hint: 'Each selected line becomes an item.' }],
				choices: { '*': 'Bulleted (•)', '1': 'Numbered (1, 2, 3)', a: 'Alphabetical (a, b, c)' },
			},
			acronym: { title: 'Insert an acronym', fields: [{ label: 'Meaning', hint: 'For example: World Wide Web Consortium.' }] },
			video: {
				title: 'Insert a video',
				fields: [{ label: 'Video address', hint: 'YouTube, Dailymotion or Vimeo.' }],
				invalid: 'Address not recognised: only YouTube, Dailymotion and Vimeo videos are embedded.',
			},
		},
	},

	/** Image button: choice of source (not in FluxToolBar). */
	imageChooser: {
		label: 'Insert an image',
		url: 'Image address (URL)',
		gallery: 'My gallery images',
		upload: 'New image (upload)',
		dialogTitle: 'Insert an image from the gallery',
		close: 'Close',
		insertAndClose: 'Insert and close',
	},
};
