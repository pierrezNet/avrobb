/**
 * Images envoyées : nommage WebP et variante mobile (services/imageVariants.ts), rendu <picture> dans
 * les messages, et conversion réelle par sharp (adapters/imageProcessor.ts).
 */

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { SharpImageProcessor } from '../src/adapters/imageProcessor.ts';
import { type BbcodeOptions, parseMessage } from '../src/services/bbcode.ts';
import { mobileVariantUrl, webpName } from '../src/services/imageVariants.ts';

const BASE = 'http://forum.test';
const options: BbcodeOptions = {
	bbcode: true,
	imgTag: true,
	showImages: true,
	smilies: false,
	censor: null,
	baseUrl: BASE,
	indentSpaces: 4,
	labels: { wrote: (author) => `${author} a écrit&#160;:`, imageLink: 'image', spoiler: 'Spoiler', video: 'Vidéo' },
};

describe('nommage', () => {
	it('extension remplacée par .webp', () => {
		expect(webpName('vol.png')).toBe('vol.webp');
		expect(webpName('photo')).toBe('photo.webp');
	});

	it('variante mobile des seules images WebP du forum', () => {
		expect(mobileVariantUrl(`${BASE}/img/members/3/vol.webp`, BASE)).toBe(`${BASE}/img/members/3/mobile_vol.webp`);
		expect(mobileVariantUrl(`${BASE}/img/gallery/1782900000.webp`, BASE)).toBe(`${BASE}/img/gallery/mobile_1782900000.webp`);
		expect(mobileVariantUrl(`${BASE}/img/members/3/vol.png`, BASE)).toBeNull();
		expect(mobileVariantUrl(`${BASE}/img/members/3/mini_vol.webp`, BASE)).toBeNull();
		expect(mobileVariantUrl('http://ailleurs.test/img/gallery/1.webp', BASE)).toBeNull();
		expect(mobileVariantUrl(`${BASE}/img/members/3/../../config.webp`, BASE)).toBeNull();
	});
});

describe('rendu des images', () => {
	it('<picture> avec la variante mobile pour une image du forum, chargement à la demande', () => {
		const html = parseMessage(`[img]${BASE}/img/gallery/42.webp[/img]`, options);
		expect(html).toContain(
			`<picture><source media="(max-width: 640px)" srcset="${BASE}/img/gallery/mobile_42.webp" type="image/webp" /><img src="${BASE}/img/gallery/42.webp"`,
		);
		expect(html).toContain('loading="lazy"');
	});

	it('image extérieure : simple <img> chargée à la demande', () => {
		const html = parseMessage('[img]http://ailleurs.test/vol.jpg[/img]', options);
		expect(html).not.toContain('<picture>');
		expect(html).toContain('<img src="http://ailleurs.test/vol.jpg" alt="vol.jpg" loading="lazy" />');
	});
});

describe('conversion par sharp', () => {
	const processor = new SharpImageProcessor();

	it('WebP, plus grand côté borné, jamais agrandie', async () => {
		const png = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#336699' } })
			.png()
			.toBuffer();
		const full = await processor.toWebp(png, 1024);
		expect(full).toMatchObject({ width: 1024, height: 512 });
		expect((await sharp(full?.data).metadata()).format).toBe('webp');
		const mobile = await processor.toWebp(png, 640);
		expect(mobile).toMatchObject({ width: 640, height: 320 });
		const small = await processor.toWebp(
			await sharp({ create: { width: 300, height: 200, channels: 3, background: '#fff' } })
				.jpeg()
				.toBuffer(),
			1024,
		);
		expect(small).toMatchObject({ width: 300, height: 200 });
	});

	it('contenu illisible : null', async () => {
		expect(await processor.toWebp(Buffer.from('<?php echo 1;'), 1024)).toBeNull();
	});

	it('avatar : recadré aux dimensions permises, format d’origine, JPEG plus léger si besoin', async () => {
		const photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#88aacc' } })
			.jpeg()
			.toBuffer();
		const small = await processor.avatar(photo, 'jpg', { width: 60, height: 60, maxBytes: 10_240 });
		expect(small?.type).toBe('jpg');
		expect(await sharp(small?.data).metadata()).toMatchObject({ width: 60, height: 60, format: 'jpeg' });
		const png = await sharp({ create: { width: 300, height: 100, channels: 4, background: '#ff0000' } })
			.png()
			.toBuffer();
		const fromPng = await processor.avatar(png, 'png', { width: 60, height: 60, maxBytes: 10_240 });
		expect(await sharp(fromPng?.data).metadata()).toMatchObject({ width: 60, height: 60, format: 'png' });
		// Bruit (incompressible) en PNG avec une limite basse : repli sur un JPEG.
		const noise = await sharp(Buffer.from(Array.from({ length: 200 * 200 * 3 }, (_, i) => (i * 7919) % 256)), {
			raw: { width: 200, height: 200, channels: 3 },
		})
			.png()
			.toBuffer();
		const light = await processor.avatar(noise, 'png', { width: 60, height: 60, maxBytes: 2_000 });
		expect(light?.type).toBe('jpg');
		expect(light?.data.length).toBeLessThanOrEqual(2_000);
	});
});
