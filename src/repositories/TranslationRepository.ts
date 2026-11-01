/**
 * Traductions automatiques du contenu (table translations, migration 0009) : lecture pour
 * l'affichage, écriture après traduction, textes encore à traduire pour la tâche planifiée.
 *
 * Chaque traduction garde le texte d'origine qu'elle traduit (`source`) : elle n'est rendue que s'il
 * est toujours le texte actuel. Une modification, quelle que soit la page qui la fait (édition,
 * balises, administration, retours d'applications), périme donc ses traductions sans suppression à
 * prévoir ; la tâche planifiée les refait. Une traduction saisie à la main (`manual`, forums) reste
 * affichée et n'est jamais remplacée.
 */

import { sql } from 'kysely';
import { chunks, ITEMS_PER_QUERY } from '../db/d1Dialect.ts';
import type { Db } from '../db/database.ts';
import type { ContentLocale, TranslationKind } from '../services/translation.ts';

/** Texte d'origine d'un élément à traduire, ou affiché. */
export interface TranslationSource {
	kind: TranslationKind;
	id: number;
	text: string;
}

export interface TranslationReader {
	/** Traductions dans `lang` encore valables (texte d'origine inchangé) : identifiant → texte traduit. */
	find(kind: TranslationKind, items: readonly { id: number; text: string }[], lang: ContentLocale): Promise<Map<number, string>>;
}

/** Traductions saisies par l'administrateur (forums). */
export interface ManualTranslationStore {
	/** Traduction saisie à la main, ou null. */
	findManual(kind: TranslationKind, id: number, lang: ContentLocale): Promise<string | null>;
	/** Enregistre une traduction manuelle (prioritaire), ou la retire (null) pour revenir à l'automatique. */
	setManual(source: TranslationSource, lang: ContentLocale, text: string | null, now: number): Promise<void>;
}

export interface TranslationWriter {
	/** Enregistre (ou remplace) la traduction de `source`, sauf traduction saisie à la main. */
	save(source: TranslationSource, lang: string, text: string, now: number): Promise<void>;
	/** Éléments sans traduction valable : forums, puis titres et messages les plus récents. */
	listPending(limit: number): Promise<TranslationSource[]>;
	/** Traductions périmées ou d'éléments supprimés (hors traductions manuelles). */
	purgeStale(): Promise<void>;
}

/** Table et colonne du texte d'origine de chaque type. */
const SOURCES = {
	post: { table: 'posts', column: 'message' },
	subject: { table: 'topics', column: 'subject' },
	forum_name: { table: 'forums', column: 'forum_name' },
	forum_desc: { table: 'forums', column: 'forum_desc' },
} as const;

/**
 * Une traduction valable existe-t-elle pour la ligne courante (texte d'origine identique, ou saisie à
 * la main) ? SQL écrit ici car il porte sur trois tables ; il ne contient que des constantes et des
 * références de colonnes, aucune saisie.
 */
function isTranslated(kind: TranslationKind) {
	const { table, column } = SOURCES[kind];
	return sql<number>`EXISTS (SELECT 1 FROM translations AS t WHERE t.kind = ${kind} AND t.item_id = ${sql.ref(`${table}.id`)} AND (t.manual = 1 OR t.source = ${sql.ref(`${table}.${column}`)}))`;
}

export class TranslationRepository implements TranslationReader, TranslationWriter, ManualTranslationStore {
	constructor(private readonly db: Db) {}

	async find(kind: TranslationKind, items: readonly { id: number; text: string }[], lang: ContentLocale): Promise<Map<number, string>> {
		const current = new Map(items.map((item) => [item.id, item.text]));
		const found = new Map<number, string>();
		for (const part of chunks([...current.keys()], ITEMS_PER_QUERY)) {
			const rows = await this.db
				.selectFrom('translations')
				.select(['item_id', 'text', 'source', 'manual'])
				.where('kind', '=', kind)
				.where('lang', '=', lang)
				.where('item_id', 'in', part)
				.execute();
			for (const row of rows) if (row.manual === 1 || row.source === current.get(row.item_id)) found.set(row.item_id, row.text);
		}
		return found;
	}

	async save(source: TranslationSource, lang: string, text: string, now: number): Promise<void> {
		await this.db
			.insertInto('translations')
			.values({ kind: source.kind, item_id: source.id, lang, text, source: source.text, created: now })
			.onConflict((conflict) =>
				conflict
					.columns(['kind', 'item_id', 'lang'])
					.doUpdateSet((eb) => ({ text: eb.ref('excluded.text'), source: eb.ref('excluded.source'), created: eb.ref('excluded.created') }))
					.where('translations.manual', '=', 0),
			)
			.execute();
	}

	async findManual(kind: TranslationKind, id: number, lang: ContentLocale): Promise<string | null> {
		const row = await this.db
			.selectFrom('translations')
			.select('text')
			.where('kind', '=', kind)
			.where('item_id', '=', id)
			.where('lang', '=', lang)
			.where('manual', '=', 1)
			.executeTakeFirst();
		return row?.text ?? null;
	}

	async setManual(source: TranslationSource, lang: ContentLocale, text: string | null, now: number): Promise<void> {
		const row = this.db
			.deleteFrom('translations')
			.where('kind', '=', source.kind)
			.where('item_id', '=', source.id)
			.where('lang', '=', lang);
		if (text === null) {
			await row.where('manual', '=', 1).execute();
			return;
		}
		await this.db.batch([
			row,
			this.db
				.insertInto('translations')
				.values({ kind: source.kind, item_id: source.id, lang, text, source: source.text, manual: 1, created: now }),
		]);
	}

	async listPending(limit: number): Promise<TranslationSource[]> {
		const [forums, topics, posts] = await Promise.all([
			this.db
				.selectFrom('forums')
				.select(['id', 'forum_name', 'forum_desc'])
				.select([isTranslated('forum_name').as('name_done'), isTranslated('forum_desc').as('desc_done')])
				.execute(),
			this.db
				.selectFrom('topics')
				.select(['id', 'subject'])
				.where('moved_to', 'is', null)
				.where(sql<boolean>`NOT ${isTranslated('subject')}`)
				.orderBy('id', 'desc')
				.limit(limit)
				.execute(),
			this.db
				.selectFrom('posts')
				.select(['id', 'message'])
				.where('message', '!=', '')
				.where(sql<boolean>`NOT ${isTranslated('post')}`)
				.orderBy('id', 'desc')
				.limit(limit)
				.execute(),
		]);
		const pending: TranslationSource[] = [];
		// Forums d'abord (peu nombreux, affichés partout), puis titres, puis messages.
		for (const forum of forums) {
			if (forum.name_done === 0) pending.push({ kind: 'forum_name', id: forum.id, text: forum.forum_name });
			const description = forum.forum_desc ?? '';
			if (description !== '' && forum.desc_done === 0) pending.push({ kind: 'forum_desc', id: forum.id, text: description });
		}
		for (const topic of topics) pending.push({ kind: 'subject', id: topic.id, text: topic.subject });
		for (const post of posts) pending.push({ kind: 'post', id: post.id, text: post.message ?? '' });
		return pending.slice(0, limit);
	}

	async purgeStale(): Promise<void> {
		await this.db.batch(
			(Object.keys(SOURCES) as TranslationKind[]).map((kind) => {
				const { table, column } = SOURCES[kind];
				return this.db
					.deleteFrom('translations')
					.where('kind', '=', kind)
					.where('manual', '=', 0)
					.where(
						sql<boolean>`NOT EXISTS (SELECT 1 FROM ${sql.table(table)} AS s WHERE s.id = translations.item_id AND ${sql.ref(`s.${column}`)} = translations.source)`,
					);
			}),
		);
	}
}
