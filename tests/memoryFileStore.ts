/**
 * Doublure en mémoire de FileStore (R2) : clés, contenus, type et date d'écriture.
 */

import type { FileStore, StoredFile, StoredFileInfo } from '../src/repositories/FileStore.ts';

interface Entry {
	data: Uint8Array;
	contentType: string;
	uploadedAt: number;
}

export class MemoryFileStore implements FileStore {
	readonly entries = new Map<string, Entry>();

	/** @param clock date d'écriture des fichiers, en secondes Unix */
	constructor(private readonly clock: () => number = () => 1_700_000_000) {}

	async put(key: string, data: Uint8Array, contentType: string): Promise<void> {
		this.entries.set(key, { data: new Uint8Array(data), contentType, uploadedAt: this.clock() });
	}

	async get(key: string): Promise<StoredFile | null> {
		const entry = this.entries.get(key);
		if (entry === undefined) return null;
		const { data } = entry;
		return {
			...this.#info(key, entry),
			body: new ReadableStream({
				start(controller) {
					controller.enqueue(data);
					controller.close();
				},
			}),
		};
	}

	async head(key: string): Promise<StoredFileInfo | null> {
		const entry = this.entries.get(key);
		return entry === undefined ? null : this.#info(key, entry);
	}

	async list(prefix: string): Promise<StoredFileInfo[]> {
		return [...this.entries]
			.filter(([key]) => key.startsWith(prefix))
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, entry]) => this.#info(key, entry));
	}

	async delete(keys: readonly string[]): Promise<void> {
		for (const key of keys) this.entries.delete(key);
	}

	/** Contenu d'un fichier en texte (UTF-8), ou undefined s'il n'existe pas. */
	text(key: string): string | undefined {
		const entry = this.entries.get(key);
		return entry === undefined ? undefined : new TextDecoder().decode(entry.data);
	}

	#info(key: string, entry: Entry): StoredFileInfo {
		return {
			key,
			contentType: entry.contentType,
			size: entry.data.length,
			etag: `"${key.length}-${entry.data.length}"`,
			uploadedAt: entry.uploadedAt,
		};
	}
}
