/**
 * Lecture des valeurs écrites par serialize() de PHP : colonne forums.moderators
 * (array(nom => id)) et table search_cache (tableaux imbriqués, dont une chaîne elle-même
 * sérialisée).
 *
 * Sous-ensemble reconnu : a (tableau), s (chaîne), i (entier), d (flottant), b (booléen), N (null).
 * Les objets (O:) sont refusés : rien n'est jamais instancié. Les longueurs `s:N:` sont en octets :
 * la lecture se fait donc sur le Buffer UTF-8.
 */

import type { PhpArray, PhpValue } from './phpVarExport.ts';

class Reader {
	#pos = 0;
	readonly #bytes: Buffer;

	constructor(text: string) {
		this.#bytes = Buffer.from(text, 'utf8');
	}

	get done(): boolean {
		return this.#pos >= this.#bytes.length;
	}

	#expect(text: string): void {
		if (this.#bytes.toString('utf8', this.#pos, this.#pos + text.length) !== text)
			throw new SyntaxError(`« ${text} » attendu à la position ${this.#pos}`);
		this.#pos += text.length;
	}

	#readUntil(terminator: string): string {
		const end = this.#bytes.indexOf(terminator, this.#pos);
		if (end === -1) throw new SyntaxError(`« ${terminator} » introuvable après la position ${this.#pos}`);
		const value = this.#bytes.toString('utf8', this.#pos, end);
		this.#pos = end + terminator.length;
		return value;
	}

	#readInt(terminator: string): number {
		const raw = this.#readUntil(terminator);
		if (!/^-?\d+$/.test(raw)) throw new SyntaxError(`Entier invalide : ${raw}`);
		return Number(raw);
	}

	value(): PhpValue {
		const type = this.#bytes.toString('utf8', this.#pos, this.#pos + 2);
		this.#pos += 2;

		switch (type) {
			case 'N;':
				return null;
			case 'b:':
				return this.#readInt(';') === 1;
			case 'i:':
				return this.#readInt(';');
			case 'd:': {
				const raw = this.#readUntil(';');
				const n = Number(raw);
				if (Number.isNaN(n)) throw new SyntaxError(`Flottant invalide : ${raw}`);
				return n;
			}
			case 's:': {
				const length = this.#readInt(':');
				this.#expect('"');
				const text = this.#bytes.toString('utf8', this.#pos, this.#pos + length);
				this.#pos += length;
				this.#expect('";');
				return text;
			}
			case 'a:': {
				const count = this.#readInt(':');
				this.#expect('{');
				const map: PhpArray = new Map();
				for (let i = 0; i < count; i++) {
					const key = this.value();
					if (typeof key !== 'string' && typeof key !== 'number') throw new SyntaxError('Clé de tableau invalide');
					map.set(key, this.value());
				}
				this.#expect('}');
				return map;
			}
			default:
				throw new SyntaxError(`Type sérialisé non reconnu : ${type}`);
		}
	}
}

/** unserialize() limité aux types scalaires et aux tableaux ; lève une SyntaxError sinon. */
export function phpUnserialize(text: string): PhpValue {
	const reader = new Reader(text);
	const value = reader.value();
	if (!reader.done) throw new SyntaxError('Données en trop après la valeur sérialisée');
	return value;
}

/** forums.moderators : tableau nom → id ; toute autre forme donne une liste vide. */
export function parseModerators(serialized: string | null): Map<string, number> {
	const moderators = new Map<string, number>();
	if (serialized === null || serialized === '') return moderators;

	try {
		const value = phpUnserialize(serialized);
		if (!(value instanceof Map)) return moderators;
		for (const [name, id] of value) {
			if (typeof id !== 'number') return new Map();
			moderators.set(String(name), id);
		}
	} catch {
		return new Map();
	}

	return moderators;
}
