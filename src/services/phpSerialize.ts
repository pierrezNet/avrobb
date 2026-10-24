/**
 * Lecture de la colonne forums.moderators, écrite par PHP avec serialize(array(nom => id)).
 * Seul ce format est accepté (tableau de chaînes → entiers) ; toute autre forme donne une liste vide.
 * Les longueurs `s:N:` de PHP sont en octets : la lecture se fait donc sur le Buffer UTF-8.
 */

export function parseModerators(serialized: string | null): Map<string, number> {
	const moderators = new Map<string, number>();

	if (serialized === null || serialized === '') return moderators;

	const bytes = Buffer.from(serialized, 'utf8');
	let pos = 0;

	const expect = (text: string): void => {
		if (bytes.toString('utf8', pos, pos + text.length) !== text) throw new SyntaxError(`« ${text} » attendu à la position ${pos}`);
		pos += text.length;
	};

	const readUntil = (terminator: string): string => {
		const end = bytes.indexOf(terminator, pos);
		if (end === -1) throw new SyntaxError(`« ${terminator} » introuvable après la position ${pos}`);
		const value = bytes.toString('utf8', pos, end);
		pos = end + terminator.length;
		return value;
	};

	const readInt = (terminator: string): number => {
		const raw = readUntil(terminator);
		if (!/^-?\d+$/.test(raw)) throw new SyntaxError(`Entier invalide : ${raw}`);
		return Number(raw);
	};

	try {
		expect('a:');
		const count = readInt(':');
		expect('{');

		for (let i = 0; i < count; i++) {
			expect('s:');
			const length = readInt(':');
			expect('"');
			const name = bytes.toString('utf8', pos, pos + length);
			pos += length;
			expect('";i:');
			moderators.set(name, readInt(';'));
		}

		expect('}');
	} catch {
		return new Map();
	}

	return moderators;
}
