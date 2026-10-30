/**
 * Consignes de réduction des images dans le navigateur (services/imageResize.ts) et leur rendu sur
 * les formulaires (tests/gallery.test.ts, tests/profile-edit.test.ts) ; membre sans adresse e-mail (comptes SSO) : pas de formulaire de contact.
 */

import { describe, expect, it } from 'vitest';
import { canEmailMember } from '../src/services/contact.ts';
import { avatarResize, galleryResize, headerImageResize, resizeView } from '../src/services/imageResize.ts';

describe('consignes de réduction', () => {
	it('galerie, avatar, logo et bannière', () => {
		expect(resizeView(galleryResize())).toEqual({
			mode: 'contain',
			width: 1024,
			height: 1024,
			variants: 'req_file_mobile:640 req_file_thumb:150',
		});
		expect(resizeView(avatarResize(180, 120))).toEqual({ mode: 'cover', width: 180, height: 120, variants: '' });
		expect(headerImageResize('logo')).toMatchObject({ mode: 'contain', width: 1204, height: 308 });
		expect(headerImageResize('banner')).toMatchObject({ width: 2560, height: 800 });
	});
});

describe('contact par e-mail', () => {
	it('impossible sans adresse, même pour un modérateur', () => {
		expect(canEmailMember({ emailSetting: 1, email: 'a@example.test' }, false)).toBe(true);
		expect(canEmailMember({ emailSetting: 1, email: '' }, true)).toBe(false);
		expect(canEmailMember({ emailSetting: 2, email: 'a@example.test' }, true)).toBe(true);
	});
});
