/**
 * English translation of src/lang/fr/toolbar.ts: BBCode toolbar texts. Tooltips show the tag syntax;
 * prompts are asked by the browser.
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
	prompts: {
		quote: ['Enter the name of the quoted user (or leave empty):'],
		link: ['Enter the URL of your link:', 'Enter a descriptive name for your link:'],
		img: ['Enter the URL of your image:', 'Enter a description for your image (alt attribute):'],
		email: ['Enter a valid e-mail address:', 'Enter a descriptive name for your e-mail link:'],
		list: ['Enter the list type: * = bulleted list, 1 = numbered list, a = alphabetical list'],
		acronym: ['Full meaning of the acronym:'],
		video: ['Enter the URL of your YouTube video (watch or embed) or Dailymotion video (URL or embed link)'],
	} as Readonly<Record<string, readonly string[]>>,

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
