/**
 * Modèles de vue des plugins d'administration portés. Fonctions pures.
 */

import { fileSize } from '../services/numberFormat.ts';

/** Fichiers des membres (plugin Uploadile) : nom sans extension, taille lisible, type. */
export function buildUploadileFiles(
	files: readonly { ownerId: number; owner: string; name: string; size: number; url: string; thumbnailUrl: string | null }[],
) {
	return files.map((file) => {
		const dot = file.name.lastIndexOf('.');
		return {
			...file,
			key: `${file.ownerId}/${file.name}`,
			label: dot > 0 ? file.name.slice(0, dot) : file.name,
			type: dot > 0 ? file.name.slice(dot + 1) : '',
			sizeText: fileSize(file.size),
		};
	});
}
