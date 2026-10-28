/**
 * Plugin AP_Balises.php (mod PunBalise de PV) : balises des sujets. Chaque balise a sa colonne
 * bal<id> dans balises_modo (une ligne par sujet) : l'ajout et la suppression d'une balise modifient
 * donc la structure de cette table, comme le PHP. Ces ALTER TABLE valident implicitement toute
 * transaction en cours : ils ne sont jamais faits dans une transaction.
 */

import { sql } from 'kysely';
import type { Db } from '../db/database.ts';

export interface LabelValues {
	name: string;
	/** Couleur #RRGGBB. */
	color: string;
	bold: boolean;
	italic: boolean;
	underline: boolean;
	/** 0 = [nom], 1 = *nom*, 2 = #nom#. */
	style: number;
	moderatorVisible: boolean;
}

export interface LabelRow extends LabelValues {
	id: number;
	position: number;
}

export interface LabelAdminStore {
	listLabels(): Promise<LabelRow[]>;
	findLabel(id: number): Promise<LabelRow | null>;
	/** Ajoute la balise et sa colonne bal<id> ; renvoie son identifiant. */
	addLabel(values: LabelValues): Promise<number>;
	updateLabel(id: number, values: LabelValues & { position: number }): Promise<void>;
	/** Supprime la balise et sa colonne bal<id>. */
	deleteLabel(id: number): Promise<void>;
	/** o_balises_version, ou null si le mod n'est pas installé. */
	installedVersion(): Promise<string | null>;
}

const flag = (value: boolean): number => (value ? 1 : 0);

export class LabelAdminRepository implements LabelAdminStore {
	constructor(private readonly db: Db) {}

	async listLabels(): Promise<LabelRow[]> {
		const rows = await this.db.selectFrom('balises').selectAll().orderBy('position').orderBy('id').execute();
		return rows.map((row) => ({
			id: row.id,
			name: row.nom,
			color: row.couleur,
			bold: row.gras === 1,
			italic: row.ital === 1,
			underline: row.souli === 1,
			style: row.baltype,
			moderatorVisible: row.affich === 1,
			position: row.position,
		}));
	}

	async findLabel(id: number): Promise<LabelRow | null> {
		return (await this.listLabels()).find((label) => label.id === id) ?? null;
	}

	async addLabel(values: LabelValues): Promise<number> {
		const result = await this.db
			.insertInto('balises')
			.values({
				nom: values.name,
				couleur: values.color,
				gras: flag(values.bold),
				ital: flag(values.italic),
				souli: flag(values.underline),
				position: 0,
				baltype: values.style,
				affich: flag(values.moderatorVisible),
			})
			.executeTakeFirstOrThrow();
		const id = Number(result.insertId);
		await sql`ALTER TABLE ${sql.table('balises_modo')} ADD ${sql.ref(`bal${id}`)} TINYINT(1) NOT NULL DEFAULT 0`.execute(this.db);
		return id;
	}

	async updateLabel(id: number, values: LabelValues & { position: number }): Promise<void> {
		await this.db
			.updateTable('balises')
			.set({
				nom: values.name,
				couleur: values.color,
				gras: flag(values.bold),
				ital: flag(values.italic),
				souli: flag(values.underline),
				position: values.position,
				baltype: values.style,
				affich: flag(values.moderatorVisible),
			})
			.where('id', '=', id)
			.execute();
	}

	async deleteLabel(id: number): Promise<void> {
		await this.db.deleteFrom('balises').where('id', '=', id).execute();
		await sql`ALTER TABLE ${sql.table('balises_modo')} DROP COLUMN IF EXISTS ${sql.ref(`bal${id}`)}`.execute(this.db);
	}

	async installedVersion(): Promise<string | null> {
		const row = await this.db.selectFrom('config').select('conf_value').where('conf_name', '=', 'o_balises_version').executeTakeFirst();
		return row !== undefined ? (row.conf_value ?? '') : null;
	}
}
