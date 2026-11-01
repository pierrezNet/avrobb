/**
 * English translation of src/lang/fr/adminAppearance.ts: Appearance admin page (admin_appearance.php,
 * AvroBB only).
 */

import type { adminAppearance as frAdminAppearance } from '../fr/adminAppearance.ts';

export const adminAppearance: typeof frAdminAppearance = {
	title: 'Appearance',
	intro: 'Logo and banner of the forum header. The uploaded image replaces the current one; the previous one is kept and can be restored.',
	current: 'Current image',
	file: 'New image',
	send: 'Replace',
	restore: 'Restore previous image',
	replaced: 'Image replaced.',
	restored: 'Previous image restored.',
	noFile: 'Choose the image to upload.',
	badType: 'The file is not a readable image (JPEG, PNG, GIF or WebP).',
	tooLarge: (width: number, height: number) =>
		`The image is larger than ${width.toLocaleString('en-US')} × ${height.toLocaleString('en-US')} pixels: shrink it before uploading.`,
	kinds: {
		logo: {
			title: 'Logo',
			help: 'Shown at the top left, at most 77 px high. PNG or WebP with a transparent background recommended, 1,204 × 308 px max.',
		},
		banner: {
			title: 'Banner (background image)',
			help: 'Shown behind the logo on large screens, full width and 124 px high, centered and cropped. A wide image (at least 1,600 px, 2,560 × 800 px max) works best, as JPEG or WebP.',
		},
	},
};
