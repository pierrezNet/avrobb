/**
 * Réglages de la barre d'outils BBCode (tables toolbar_conf et toolbar_tags du mod FluxToolBar).
 */

import type { Db } from '../db/database.ts';
import type { ToolbarSettings } from '../services/toolbar.ts';

export interface ToolbarReader {
	/** Réglages de l'administrateur, ou null si le mod n'a pas été configuré (aucun bouton). */
	load(): Promise<ToolbarSettings | null>;
}

export class ToolbarRepository implements ToolbarReader {
	constructor(private readonly db: Db) {}

	async load(): Promise<ToolbarSettings | null> {
		const [conf, tags] = await Promise.all([
			this.db.selectFrom('toolbar_conf').select(['conf_name', 'conf_value']).execute(),
			this.db
				.selectFrom('toolbar_tags')
				.select(['name', 'code', 'func', 'image', 'enable_form', 'enable_quick'])
				.orderBy('position')
				.execute(),
		]);
		if (tags.length === 0) return null;

		const value = (name: string): string => conf.find((row) => row.conf_name === name)?.conf_value ?? '';
		return {
			enableForm: value('enable_form') === '1',
			enableQuick: value('enable_quick') === '1',
			imagePack: /^[\w-]+$/.test(value('img_pack')) ? value('img_pack') : 'smooth',
			tags: tags.map((row) => ({
				name: row.name,
				code: row.code,
				func: Number(row.func ?? 0),
				// Nom de fichier seul : l'icône est servie depuis img/fluxtoolbar/<pack>/.
				image: /^[\w.-]+$/.test(row.image) ? row.image : '',
				enableForm: row.enable_form === 1,
				enableQuick: row.enable_quick === 1,
			})),
		};
	}
}
