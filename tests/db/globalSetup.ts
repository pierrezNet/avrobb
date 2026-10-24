/**
 * Recrée la base de test avant les tests d'intégration : schéma FluxBB de PV puis jeu de données fixe.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createConnection } from 'mysql2/promise';
import { testDbConfig } from './testDatabase.ts';

export default async function setup(): Promise<void> {
	const config = testDbConfig();
	const connection = await createConnection({
		host: config.host,
		port: config.port,
		user: config.user,
		password: config.password,
		charset: 'utf8mb4',
		multipleStatements: true,
	});

	try {
		const [schema, seed] = await Promise.all(
			['schema.sql', 'seed.sql'].map((file) => readFile(path.join(import.meta.dirname, file), 'utf8')),
		);
		await connection.query(`DROP DATABASE IF EXISTS \`${config.database}\``);
		await connection.query(`CREATE DATABASE \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
		await connection.query(`USE \`${config.database}\``);
		await connection.query(schema ?? '');
		await connection.query(seed ?? '');
	} finally {
		await connection.end();
	}
}
