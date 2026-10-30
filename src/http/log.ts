/**
 * Journal des requêtes : une ligne JSON par événement sur la sortie d'erreur (lue par le terminal
 * en développement, par les journaux Workers en production), ou rien (tests).
 */

import type { Logger } from './context.ts';

function line(level: 'error' | 'info', context: { err: unknown }, message: string): string {
	const { err } = context;
	const error = err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err;
	return JSON.stringify({ level, time: new Date().toISOString(), msg: message, err: error });
}

export const consoleLogger: Logger = {
	error: (context, message) => console.error(line('error', context, message)),
	info: (context, message) => console.error(line('info', context, message)),
};

export const silentLogger: Logger = {
	error: () => undefined,
	info: () => undefined,
};
