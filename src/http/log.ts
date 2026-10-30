/**
 * Journal des requêtes : une ligne JSON par événement sur la sortie d'erreur (lue par le terminal
 * en développement, par les journaux Workers en production), ou rien (tests).
 */

import type { LogContext, Logger } from './context.ts';

function line(level: 'error' | 'info', context: LogContext, message: string): string {
	const { err, ...fields } = context;
	const error = err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err;
	return JSON.stringify({ level, time: new Date().toISOString(), msg: message, ...fields, ...(err !== undefined ? { err: error } : {}) });
}

export const consoleLogger: Logger = {
	error: (context, message) => console.error(line('error', context, message)),
	info: (context, message) => console.error(line('info', context, message)),
};

export const silentLogger: Logger = {
	error: () => undefined,
	info: () => undefined,
};
