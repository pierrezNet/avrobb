/**
 * Ajoute le préfixe FluxBB ($db->prefix, « fo_ » chez Pilote-Virtuel) aux noms de tables.
 *
 * Les requêtes s'écrivent avec les noms nus (`topics`), typés par `Database`. Seuls les
 * identifiants qui sont de vraies tables sont préfixés : les alias (`t`, `p`…) restent intacts.
 */

import {
	type KyselyPlugin,
	OperationNodeTransformer,
	type PluginTransformQueryArgs,
	type PluginTransformResultArgs,
	type QueryResult,
	type RootOperationNode,
	type TableNode,
	type UnknownRow,
} from 'kysely';

class TablePrefixTransformer extends OperationNodeTransformer {
	readonly #prefix: string;
	readonly #tables: ReadonlySet<string>;

	constructor(prefix: string, tables: Iterable<string>) {
		super();
		this.#prefix = prefix;
		this.#tables = new Set(tables);
	}

	protected override transformTable(node: TableNode): TableNode {
		const transformed = super.transformTable(node);
		const identifier = transformed.table.identifier;

		if (!this.#tables.has(identifier.name)) return transformed;

		return {
			...transformed,
			table: {
				...transformed.table,
				identifier: { ...identifier, name: this.#prefix + identifier.name },
			},
		};
	}
}

export class TablePrefixPlugin implements KyselyPlugin {
	readonly #transformer: TablePrefixTransformer;

	constructor(prefix: string, tables: Iterable<string>) {
		this.#transformer = new TablePrefixTransformer(prefix, tables);
	}

	transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
		return this.#transformer.transformNode(args.node);
	}

	async transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
		return args.result;
	}
}
