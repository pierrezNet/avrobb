/**
 * English translation of src/lang/fr/help.ts (BBCode help). The “Additional tags” section
 * documents the tags of the FluxToolBar mod, which the original PHP help leaves out.
 */

import type { help as frHelp } from '../fr/help.ts';

export const help: typeof frHelp = {
	help: 'Help',
	produces: 'produces',
	and: 'and',
	bbcode: 'BBCode',
	bbcodeInfo1:
		'BBCode is a collection of formatting tags used to change the look of text or add graphical elements on these forums. BBCode is based on the same principle as HTML and looks a lot like it. Just wrap the parts you want to change or add in tags ([tag_name]text to change[/tag_name]). Below is the list of all available BBCode tags and how to use them.',
	bbcodeInfo2:
		'Administrators can turn BBCode on or off. You can check whether BBCode is enabled when writing a post or editing your signature.',
	textStyle: 'Text style',
	textStyleInfo: 'The following tags change the look of text:',
	boldText: 'Bold text',
	underlinedText: 'Underlined text',
	italicText: 'Italic text',
	strikeText: 'Strikethrough text',
	redText: 'Red text',
	blueText: 'Blue text',
	headingText: 'Heading',
	deletedText: 'Deleted text',
	insertedText: 'Inserted text',
	emphasisedText: 'Emphasized text',
	linksAndImages: 'Links and images',
	thisHelpPage: 'This help page',
	linksInfo: 'You can create links to other documents or to email addresses with the following tags:',
	myEmailAddress: 'My email address',
	imagesInfo:
		'If you want to show an image, use the “img” tag. The text after the “=” sign in the opening tag is used for the alt attribute (alternative text shown if the image can’t be displayed) and should be added whenever possible',
	bbcodeTest: 'AvroBB BBCode test',
	testTopic: 'Test topic',
	testPost: 'Test post',
	testForum: 'Test forum',
	testUser: 'Test user',
	quotes: 'Quotes',
	quotesInfo: 'If you want to quote someone, use the “quote” tag.',
	quotesInfo2: 'If you don’t want to quote anyone in particular, you can use the “quote” tag without a name.',
	quoteText: 'This is the text I want to quote.',
	quoteNote: 'Note: if a username contains the characters [ or ], you can wrap it in quotation marks.',
	code: 'Code',
	codeInfo:
		'When showing source code, make sure you use the “code” tag. Text between code tags is shown in a monospaced font and is not affected by other tags.',
	codeText: 'This is some code.',
	nestedTags: 'Nested tags',
	nestedTagsInfo: 'BBCode tags can be nested for advanced formatting. For example:',
	boldUnderlined: 'Bold, underlined text',
	lists: 'Lists',
	listInfo: 'To create a list, use the “list” tag. Three kinds of lists are available.',
	listText1: 'Example first list item.',
	listText2: 'Example second list item.',
	listText3: 'Example third list item.',
	pvTags: 'Additional tags',
	pvTagsInfo: 'The forum also understands these tags, offered by the editing toolbar:',
	centeredText: 'Centered text',
	hiddenText: 'End of the movie: the pilot lands.',
	videoInfo:
		'The “video” tag embeds a YouTube, Dailymotion or Vimeo video from its address: [video]https://www.youtube.com/watch?v=…[/video].',
	smilies: 'Smilies',
	smiliesInfo: 'If you like (and if this feature is enabled), the forums turn the following smilies into emoji:',
};
