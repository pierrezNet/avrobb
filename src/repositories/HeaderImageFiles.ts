/**
 * Logo et bannière du forum dans R2 (services/headerImages.ts) : écriture avec copie de l'image
 * précédente, et retour à cette copie. Tant qu'aucune image n'a été envoyée, l'en-tête affiche les
 * images d'AvroBB de public/assets/ (headerImageHref) ; au premier remplacement, c'est elle qui
 * devient l'image précédente, lue par `loadDefault`. La version des adresses (o_header_version)
 * est commune aux deux images : dès le premier envoi, les deux sont donc lues dans R2, et l'image
 * d'AvroBB de l'autre type y est déposée.
 */

import { HEADER_IMAGES, type HeaderImageKind } from '../services/headerImages.ts';
import type { FileStore } from './FileStore.ts';

export interface HeaderImageStore {
	/** Remplace l'image ; l'actuelle devient l'image précédente. */
	replace(kind: HeaderImageKind, data: Uint8Array, contentType: string): Promise<void>;
	/** Échange l'image et la précédente ; false s'il n'y a pas d'image précédente. */
	restore(kind: HeaderImageKind): Promise<boolean>;
	hasPrevious(kind: HeaderImageKind): Promise<boolean>;
}

/** Image d'AvroBB (public/assets/), lue par le Worker dans Static Assets. */
export type DefaultImageLoader = (assetPath: string) => Promise<{ data: Uint8Array; contentType: string } | null>;

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

export class HeaderImageFiles implements HeaderImageStore {
	constructor(
		private readonly files: FileStore,
		private readonly loadDefault: DefaultImageLoader,
	) {}

	async replace(kind: HeaderImageKind, data: Uint8Array, contentType: string): Promise<void> {
		const spec = HEADER_IMAGES[kind];
		const current = await this.files.get(spec.path);
		const previous =
			current !== null ? { data: await readAll(current.body), contentType: current.contentType } : await this.loadDefault(spec.defaultPath);
		if (previous !== null) await this.files.put(spec.previousPath, previous.data, previous.contentType);
		await this.files.put(spec.path, data, contentType);
		for (const other of Object.keys(HEADER_IMAGES) as HeaderImageKind[]) if (other !== kind) await this.#installDefault(other);
	}

	/** Image d'AvroBB déposée dans R2 si ce type n'y a encore aucune image. */
	async #installDefault(kind: HeaderImageKind): Promise<void> {
		const spec = HEADER_IMAGES[kind];
		if ((await this.files.head(spec.path)) !== null) return;
		const image = await this.loadDefault(spec.defaultPath);
		if (image !== null) await this.files.put(spec.path, image.data, image.contentType);
	}

	async restore(kind: HeaderImageKind): Promise<boolean> {
		const spec = HEADER_IMAGES[kind];
		const [current, previous] = await Promise.all([this.files.get(spec.path), this.files.get(spec.previousPath)]);
		if (previous === null) return false;
		const previousData = await readAll(previous.body);
		if (current !== null) await this.files.put(spec.previousPath, await readAll(current.body), current.contentType);
		await this.files.put(spec.path, previousData, previous.contentType);
		return true;
	}

	async hasPrevious(kind: HeaderImageKind): Promise<boolean> {
		return (await this.files.head(HEADER_IMAGES[kind].previousPath)) !== null;
	}
}
