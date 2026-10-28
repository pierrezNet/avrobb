/**
 * Plugin AP_Smilies.php : smileys du PHP (table smilies) et leurs images (img/smilies/). Après chaque
 * modification de la table, l'appelant supprime cache_smilies.php.
 */

import type { Dirent } from 'node:fs';
import { readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Db } from '../db/database.ts';
import { safeBaseName } from '../services/uploads.ts';
import { inTransaction } from './transactions.ts';

export interface SmileyRow {
	id: number;
	text: string;
	image: string;
	position: number;
}

export interface SmileyAdminStore {
	listSmilies(): Promise<SmileyRow[]>;
	updateSmilies(rows: readonly SmileyRow[]): Promise<void>;
	removeSmilies(ids: readonly number[]): Promise<void>;
	addSmiley(text: string, image: string): Promise<void>;
}

export interface SmileyImageStore {
	/** Fichiers de img/smilies/ (sans index.html), dans l'ordre naturel. */
	listImages(): Promise<string[]>;
	/** Supprime une image ; faux si elle n'a pas pu l'être. */
	deleteImage(name: string): Promise<boolean>;
	/** Enregistre `<base>.<extension>` en remplaçant les autres extensions du même nom, comme le plugin. */
	saveImage(base: string, extension: 'gif' | 'jpg' | 'png', data: Buffer): Promise<void>;
}

export class SmileyAdminRepository implements SmileyAdminStore {
	constructor(private readonly db: Db) {}

	async listSmilies(): Promise<SmileyRow[]> {
		const rows = await this.db
			.selectFrom('smilies')
			.select(['id', 'text', 'image', 'disp_position'])
			.orderBy('disp_position')
			.orderBy('id')
			.execute();
		return rows.map((row) => ({ id: row.id, text: row.text, image: row.image, position: row.disp_position }));
	}

	async updateSmilies(rows: readonly SmileyRow[]): Promise<void> {
		await inTransaction(this.db, async (trx) => {
			for (const row of rows)
				await trx
					.updateTable('smilies')
					.set({ text: row.text, image: row.image, disp_position: row.position })
					.where('id', '=', row.id)
					.execute();
		});
	}

	async removeSmilies(ids: readonly number[]): Promise<void> {
		if (ids.length > 0) await this.db.deleteFrom('smilies').where('id', 'in', ids).execute();
	}

	async addSmiley(text: string, image: string): Promise<void> {
		await this.db.insertInto('smilies').values({ text, image }).execute();
	}
}

export class SmileyImageFiles implements SmileyImageStore {
	/** @param legacyRoot racine de l'installation PHP sur le disque */
	constructor(private readonly legacyRoot: string) {}

	#dir(): string {
		return path.join(this.legacyRoot, 'img', 'smilies');
	}

	async listImages(): Promise<string[]> {
		let entries: Dirent[];
		try {
			entries = await readdir(this.#dir(), { withFileTypes: true });
		} catch {
			return [];
		}
		return entries
			.filter((entry) => entry.isFile() && entry.name !== 'index.html')
			.map((entry) => entry.name)
			.sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
	}

	async deleteImage(name: string): Promise<boolean> {
		const base = safeBaseName(name);
		if (base === null || base === 'index.html') return false;
		try {
			await rm(path.join(this.#dir(), base));
			return true;
		} catch {
			return false;
		}
	}

	async saveImage(base: string, extension: 'gif' | 'jpg' | 'png', data: Buffer): Promise<void> {
		const safe = safeBaseName(base);
		if (safe === null || !/^[\w-]+$/.test(safe)) throw new Error('Nom de fichier refusé');
		const temporary = path.join(this.#dir(), `${safe}.tmp`);
		await writeFile(temporary, data);
		for (const other of ['gif', 'jpg', 'png']) await rm(path.join(this.#dir(), `${safe}.${other}`), { force: true });
		await rename(temporary, path.join(this.#dir(), `${safe}.${extension}`));
	}
}
