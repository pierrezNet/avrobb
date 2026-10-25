/**
 * Type et dimensions d'une image d'après ses premiers octets, comme getimagesize() pour les formats
 * acceptés en avatar (GIF, JPEG, PNG). On se fie au contenu, jamais au type annoncé par le
 * navigateur ni à l'extension du nom de fichier.
 */

export type ImageType = 'gif' | 'jpg' | 'png';

export interface ImageInfo {
	type: ImageType;
	width: number;
	height: number;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Marqueurs JPEG « Start Of Frame » qui portent les dimensions (hors DHT 0xC4, JPG 0xC8, DAC 0xCC). */
const JPEG_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function jpegSize(data: Buffer): { width: number; height: number } | null {
	let offset = 2;
	while (offset + 4 <= data.length) {
		if (data[offset] !== 0xff) return null;
		const marker = data[offset + 1] ?? 0;
		// Octets de remplissage 0xFF entre deux segments.
		if (marker === 0xff) {
			offset += 1;
			continue;
		}
		const length = data.readUInt16BE(offset + 2);
		if (JPEG_SOF.has(marker)) {
			if (offset + 9 > data.length) return null;
			return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
		}
		offset += 2 + length;
	}
	return null;
}

/** Type et dimensions, ou null si le contenu n'est pas une image GIF, JPEG ou PNG lisible. */
export function readImageInfo(data: Buffer): ImageInfo | null {
	if (data.length >= 24 && data.subarray(0, 8).equals(PNG_SIGNATURE) && data.toString('latin1', 12, 16) === 'IHDR')
		return { type: 'png', width: data.readUInt32BE(16), height: data.readUInt32BE(20) };

	if (data.length >= 10 && (data.toString('latin1', 0, 6) === 'GIF87a' || data.toString('latin1', 0, 6) === 'GIF89a'))
		return { type: 'gif', width: data.readUInt16LE(6), height: data.readUInt16LE(8) };

	if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
		const size = jpegSize(data);
		return size !== null ? { type: 'jpg', ...size } : null;
	}

	return null;
}

export type AvatarError =
	| { kind: 'noFile' }
	| { kind: 'badType' }
	| { kind: 'tooLarge'; max: number }
	| { kind: 'tooWideOrHigh'; width: number; height: number };

/** Contrôles de profile.php?action=upload_avatar : type réel, poids puis dimensions. */
export function checkAvatar(
	data: Buffer,
	limits: { maxBytes: number; maxWidth: number; maxHeight: number },
): { image: ImageInfo } | { error: AvatarError } {
	if (data.length === 0) return { error: { kind: 'noFile' } };
	const image = readImageInfo(data);
	if (image === null) return { error: { kind: 'badType' } };
	if (data.length > limits.maxBytes) return { error: { kind: 'tooLarge', max: limits.maxBytes } };
	if (image.width === 0 || image.height === 0 || image.width > limits.maxWidth || image.height > limits.maxHeight)
		return { error: { kind: 'tooWideOrHigh', width: limits.maxWidth, height: limits.maxHeight } };
	return { image };
}
