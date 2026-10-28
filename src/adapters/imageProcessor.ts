/**
 * Conversion des images envoyées (bibliothèque sharp) : WebP, orientation EXIF appliquée, plus grand
 * côté limité, jamais agrandie. Les GIF animés restent animés. Avatars : recadrés aux dimensions
 * permises, dans un format que le PHP sait afficher (GIF, JPEG, PNG). Logo et bannière du forum :
 * réduits dans un cadre, au format du fichier qu'ils remplacent (PNG, JPEG).
 */

import sharp from 'sharp';
import type { ImageType } from '../services/images.ts';

export interface ProcessedImage {
	data: Buffer;
	width: number;
	height: number;
}

export interface ImageProcessor {
	/**
	 * Image en WebP, plus grand côté ≤ `maxSide` (image, variante mobile ou vignette) ; null si le
	 * contenu n'est pas une image lisible.
	 */
	toWebp(data: Buffer, maxSide: number): Promise<ProcessedImage | null>;
	/**
	 * Avatar recadré (centre d'intérêt) aux dimensions `width` × `height`, dans son format d'origine ;
	 * en JPEG plus compressé s'il dépasse encore `maxBytes`. null si illisible ou toujours trop lourd.
	 */
	avatar(
		data: Buffer,
		type: ImageType,
		limits: { width: number; height: number; maxBytes: number },
	): Promise<{ data: Buffer; type: ImageType } | null>;
	/**
	 * Image réduite pour tenir dans `maxWidth` × `maxHeight` (jamais agrandie), en PNG (transparence
	 * gardée) ou en JPEG ; null si le contenu n'est pas une image lisible.
	 */
	fit(data: Buffer, options: { format: 'png' | 'jpeg'; maxWidth: number; maxHeight: number }): Promise<ProcessedImage | null>;
}

/** Qualité WebP : bon compromis poids / netteté pour des captures d'écran et des photos. */
const QUALITY = 80;

export class SharpImageProcessor implements ImageProcessor {
	async fit(data: Buffer, options: { format: 'png' | 'jpeg'; maxWidth: number; maxHeight: number }): Promise<ProcessedImage | null> {
		try {
			const resized = sharp(data, { limitInputPixels: 50_000_000 })
				.rotate()
				.resize({ width: options.maxWidth, height: options.maxHeight, fit: 'inside', withoutEnlargement: true });
			const encoded =
				options.format === 'png'
					? resized.png({ compressionLevel: 9 })
					: resized.flatten({ background: '#ffffff' }).jpeg({ quality: 82, mozjpeg: true });
			const { data: output, info } = await encoded.toBuffer({ resolveWithObject: true });
			return { data: output, width: info.width, height: info.height };
		} catch {
			return null;
		}
	}

	async toWebp(data: Buffer, maxSide: number): Promise<ProcessedImage | null> {
		try {
			const { data: output, info } = await sharp(data, { animated: true, limitInputPixels: 50_000_000 })
				.rotate()
				.resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
				.webp({ quality: QUALITY })
				.toBuffer({ resolveWithObject: true });
			return { data: output, width: info.width, height: info.pageHeight ?? info.height };
		} catch {
			return null;
		}
	}

	async avatar(
		data: Buffer,
		type: ImageType,
		limits: { width: number; height: number; maxBytes: number },
	): Promise<{ data: Buffer; type: ImageType } | null> {
		const animated = type === 'gif';
		const resized = (): sharp.Sharp =>
			sharp(data, { animated, limitInputPixels: 50_000_000 })
				.rotate()
				.resize({
					width: limits.width,
					height: limits.height,
					fit: 'cover',
					// Recadrage sur la zone la plus intéressante (visage, sujet) ; centré pour un GIF animé.
					position: animated ? 'centre' : sharp.strategy.attention,
					withoutEnlargement: true,
				});
		try {
			const first =
				type === 'gif'
					? await resized().gif().toBuffer()
					: type === 'png'
						? await resized().png({ compressionLevel: 9, palette: true }).toBuffer()
						: await resized().jpeg({ quality: 85, mozjpeg: true }).toBuffer();
			if (first.length <= limits.maxBytes) return { data: first, type };
			// Trop lourd (GIF animé, photo en PNG…) : JPEG de plus en plus compressé, première image seule.
			for (const quality of [80, 65, 50, 35]) {
				const jpeg = await sharp(data, { limitInputPixels: 50_000_000 })
					.rotate()
					.resize({
						width: limits.width,
						height: limits.height,
						fit: 'cover',
						position: sharp.strategy.attention,
						withoutEnlargement: true,
					})
					.flatten({ background: '#ffffff' })
					.jpeg({ quality, mozjpeg: true })
					.toBuffer();
				if (jpeg.length <= limits.maxBytes) return { data: jpeg, type: 'jpg' };
			}
			return null;
		} catch {
			return null;
		}
	}
}
