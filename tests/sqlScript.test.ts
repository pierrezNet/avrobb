/**
 * Découpage des fichiers SQL en instructions (src/db/sqlScript.ts), pour les lots D1.
 */

import { describe, expect, it } from 'vitest';
import { splitSqlStatements } from '../src/db/sqlScript.ts';

describe('splitSqlStatements', () => {
	it('sépare les instructions et retire les commentaires', () => {
		expect(splitSqlStatements('-- en-tête\nCREATE TABLE t (\n\tid INTEGER -- clé\n);\n\nINSERT INTO t VALUES (1);\n')).toEqual([
			'CREATE TABLE t (\n\tid INTEGER \n)',
			'INSERT INTO t VALUES (1)',
		]);
	});

	it('garde « ; » et « -- » à l’intérieur des chaînes, guillemets doublés compris', () => {
		expect(splitSqlStatements("INSERT INTO c VALUES ('a; b -- c', 'l''été');")).toEqual(["INSERT INTO c VALUES ('a; b -- c', 'l''été')"]);
	});

	it('accepte une dernière instruction sans point-virgule et ignore les vides', () => {
		expect(splitSqlStatements(';;SELECT 1\n')).toEqual(['SELECT 1']);
	});
});
