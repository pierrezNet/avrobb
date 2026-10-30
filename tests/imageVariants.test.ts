/**
 * Images envoyées : nommage WebP et variante mobile (services/imageVariants.ts), rendu <picture> et
 * carte de la galerie dans les messages, adresses relatives (/img/…) comme absolues.
 */

import { describe, expect, it } from 'vitest';
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

	it('adresse relative : variante relative, aussi sans adresse du forum', () => {
		expect(mobileVariantUrl('/img/gallery/1782900000.webp', BASE)).toBe('/img/gallery/mobile_1782900000.webp');
		expect(mobileVariantUrl('/img/gallery/1782900000.webp', '')).toBe('/img/gallery/mobile_1782900000.webp');
		expect(mobileVariantUrl('/img/gallery/1782900000.jpg', BASE)).toBeNull();
		expect(mobileVariantUrl('//ailleurs.test/img/gallery/1.webp', BASE)).toBeNull();
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

	it('adresse relative d’une image du forum (/img/…) acceptée, pas une adresse « //hôte »', () => {
		expect(parseMessage('[img]/img/gallery/42.webp[/img]', options)).toContain(
			'<picture><source media="(max-width: 640px)" srcset="/img/gallery/mobile_42.webp" type="image/webp" /><img src="/img/gallery/42.webp"',
		);
		expect(parseMessage('[img=Vol]/img/gallery/42.jpg[/img]', options)).toContain(
			'<img src="/img/gallery/42.jpg" alt="Vol" loading="lazy" />',
		);
		expect(parseMessage('[img]//ailleurs.test/x.jpg[/img]', options)).not.toContain('<img');
		expect(parseMessage('[img]/autre/x.jpg[/img]', options)).not.toContain('<img');
	});

	it('image extérieure : simple <img> chargée à la demande', () => {
		const html = parseMessage('[img]http://ailleurs.test/vol.jpg[/img]', options);
		expect(html).not.toContain('<picture>');
		expect(html).toContain('<img src="http://ailleurs.test/vol.jpg" alt="vol.jpg" loading="lazy" />');
	});
});

describe('carte d’une image de la galerie', () => {
	it('titre, image et description insérés depuis la galerie : <figure> avec légende', () => {
		const html = parseMessage(`Avant\n\n[b]Peinture[/b]\n[img]${BASE}/img/gallery/42.webp[/img]\nLivrée [i]hier[/i]\n\nAprès`, options);
		expect(html).toContain('<figure class="post-card"><span class="postimg"><picture>');
		expect(html).toContain('alt="Peinture"');
		expect(html).toContain(
			'<figcaption><strong class="post-card__title">Peinture</strong><span class="post-card__text">Livrée <em>hier</em></span></figcaption></figure><p>Après</p>',
		);
	});

	it('adresse relative (insertion actuelle de la galerie) : carte aussi', () => {
		const html = parseMessage('[b]Peinture[/b]\n[img]/img/gallery/42.jpg[/img]\nLivrée hier', options);
		expect(html).toContain('<figure class="post-card"><span class="postimg"><img src="/img/gallery/42.jpg" alt="Peinture"');
	});

	it('image d’un autre site, ou bloc mêlé à du texte : pas de carte', () => {
		expect(parseMessage('[b]Ailleurs[/b]\n[img]http://autre.test/img/gallery/1.jpg[/img]', options)).not.toContain('<figure');
		expect(parseMessage(`Texte [b]Titre[/b]\n[img]${BASE}/img/gallery/1.webp[/img]`, options)).not.toContain('<figure');
	});

	it('images masquées par le lecteur : simple lien, pas de carte', () => {
		expect(parseMessage(`[b]T[/b]\n[img]${BASE}/img/gallery/1.webp[/img]`, { ...options, showImages: false })).not.toContain('<figure');
	});
});
