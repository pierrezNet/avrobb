/**
 * Balises de sujet de PV (mod PunBalise 2.5) : définitions dans balises, et pour chaque sujet une
 * ligne de balises_modo avec une colonne bal<id> par balise (1 = posée).
 */

import type { Db } from '../db/database.ts';
import type { TopicLabel } from '../domain/models.ts';

export interface TopicLabelReader {
	/** Balises posées sur chaque sujet demandé, dans l'ordre balises.position. */
	listForTopics(topicIds: readonly number[]): Promise<Map<number, TopicLabel[]>>;
	/** Toutes les balises définies, dans l'ordre (pour la mise en couleur de balises.php). */
	listDefinitions(): Promise<TopicLabel[]>;
}

const STYLES = ['brackets', 'stars', 'hashes'] as const;

export class TopicLabelRepository implements TopicLabelReader {
	constructor(private readonly db: Db) {}

	async listForTopics(topicIds: readonly number[]): Promise<Map<number, TopicLabel[]>> {
		const result = new Map<number, TopicLabel[]>();
		if (topicIds.length === 0) return result;

		const definitions = await this.listDefinitions();
		if (definitions.length === 0) return result;

		const rows = await this.db
			.selectFrom('balises_modo')
			.selectAll()
			.where(
				'npost',
				'in',
				topicIds.map((id) => String(id)),
			)
			.execute();

		for (const row of rows) {
			// Colonnes bal<id> absentes du schéma typé : elles sont créées par le plugin d'administration.
			const flags = row as unknown as Record<string, unknown>;
			const labels = definitions.filter((definition) => Number(flags[`bal${definition.id}`]) === 1);
			if (labels.length > 0) result.set(Number(row.npost), labels);
		}

		return result;
	}

	async listDefinitions(): Promise<TopicLabel[]> {
		const rows = await this.db.selectFrom('balises').selectAll().orderBy('position').execute();
		return rows.map((row) => ({
			id: row.id,
			name: row.nom,
			style: STYLES[row.baltype] ?? 'brackets',
			color: row.couleur,
			bold: row.gras === 1,
			italic: row.ital === 1,
			underline: row.souli === 1,
		}));
	}
}
