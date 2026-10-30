/**
 * Découpe un fichier SQL (migration, jeu de données) en instructions, pour les exécuter dans un lot
 * D1 : `exec()` n'accepte qu'une instruction par ligne. Commentaires « -- » retirés (hors chaînes) ;
 * une instruction se termine par un « ; » hors chaîne.
 */

export function splitSqlStatements(script: string): string[] {
	const statements: string[] = [];
	let current = '';
	let inString = false;
	for (let index = 0; index < script.length; index++) {
		const char = script[index];
		if (!inString && char === '-' && script[index + 1] === '-') {
			const end = script.indexOf('\n', index);
			index = end === -1 ? script.length : end - 1;
			continue;
		}
		if (char === "'") inString = !inString;
		if (!inString && char === ';') {
			if (current.trim() !== '') statements.push(current.trim());
			current = '';
			continue;
		}
		current += char;
	}
	if (current.trim() !== '') statements.push(current.trim());
	return statements;
}
