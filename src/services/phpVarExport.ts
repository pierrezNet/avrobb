/**
 * Lecture des fichiers de cache PHP de FluxBB (cache/cache_*.php), produits par var_export() dans
 * include/cache.php : `$pun_config = array ( 'o_board_title' => '…', … );`.
 *
 * On n'évalue jamais de PHP : seul le sous-ensemble de var_export() est reconnu (chaînes entre
 * apostrophes avec \\ et \' comme seuls échappements, entiers, flottants, NULL, true, false, array).
 * Toute autre forme lève une SyntaxError ; l'appelant se rabat alors sur la base.
 */

export type PhpValue = string | number | boolean | null | PhpArray;
export type PhpArray = Map<string | number, PhpValue>;

class Parser {
	#pos = 0;

	constructor(private readonly source: string) {}

	parseAssignment(variable: string): PhpValue {
		const marker = `$${variable}`;
		const start = this.source.indexOf(marker);
		if (start === -1) throw new SyntaxError(`Variable ${marker} introuvable`);

		this.#pos = start + marker.length;
		this.expect('=');
		const value = this.value();
		this.expect(';');
		return value;
	}

	private skipSpaces(): void {
		while (this.#pos < this.source.length && /\s/.test(this.source.charAt(this.#pos))) this.#pos++;
	}

	private peek(text: string): boolean {
		this.skipSpaces();
		return this.source.startsWith(text, this.#pos);
	}

	private expect(text: string): void {
		if (!this.peek(text)) throw new SyntaxError(`« ${text} » attendu à la position ${this.#pos}`);
		this.#pos += text.length;
	}

	private value(): PhpValue {
		this.skipSpaces();

		if (this.peek("'")) return this.string();
		if (this.peek('array')) return this.array();

		const word = /^(NULL|true|false|-?\d+(?:\.\d+)?(?:E[+-]?\d+)?)/i.exec(this.source.slice(this.#pos));
		if (word?.[1] === undefined) throw new SyntaxError(`Valeur PHP non reconnue à la position ${this.#pos}`);

		this.#pos += word[1].length;
		const token = word[1].toLowerCase();

		if (token === 'null') return null;
		if (token === 'true' || token === 'false') return token === 'true';
		return Number(token);
	}

	private string(): string {
		this.expect("'");
		let out = '';

		while (this.#pos < this.source.length) {
			const c = this.source.charAt(this.#pos++);

			if (c === "'") return out;

			if (c === '\\') {
				const next = this.source.charAt(this.#pos);
				// En PHP, seuls \\ et \' sont des échappements dans une chaîne entre apostrophes.
				if (next === '\\' || next === "'") {
					out += next;
					this.#pos++;
					continue;
				}
			}

			out += c;
		}

		throw new SyntaxError('Chaîne PHP non terminée');
	}

	private array(): PhpArray {
		this.expect('array');
		this.expect('(');
		const map: PhpArray = new Map();

		while (!this.peek(')')) {
			const key = this.value();
			if (typeof key !== 'string' && typeof key !== 'number') throw new SyntaxError(`Clé de tableau invalide à la position ${this.#pos}`);

			this.expect('=>');
			map.set(key, this.value());

			if (!this.peek(',')) break;
			this.expect(',');
		}

		this.expect(')');
		return map;
	}
}

/** Valeur affectée à `$variable` dans un fichier de cache PHP. */
export function parsePhpCacheVariable(source: string, variable: string): PhpValue {
	return new Parser(source).parseAssignment(variable);
}

/** Tableau PHP à plat de chaînes (cas de $pun_config) ; NULL devient une chaîne vide, comme en PHP. */
export function toStringMap(value: PhpValue): Map<string, string> {
	if (!(value instanceof Map)) throw new SyntaxError('Tableau PHP attendu');

	const result = new Map<string, string>();

	for (const [key, item] of value) {
		if (item instanceof Map) throw new SyntaxError(`Valeur scalaire attendue pour ${key}`);
		result.set(String(key), item === null || item === false ? '' : item === true ? '1' : String(item));
	}

	return result;
}
