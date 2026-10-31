/**
 * Déclaration minimale du module « cloudflare:workers » (fourni par le runtime Workers, sans
 * @cloudflare/workers-types dans ce projet) : seulement WorkerEntrypoint, pour exposer des méthodes
 * appelables par liaison de service (RPC) et non par une adresse publique.
 */
declare module 'cloudflare:workers' {
	export abstract class WorkerEntrypoint<Env = unknown> {
		protected readonly env: Env;
		protected readonly ctx: { waitUntil(promise: Promise<unknown>): void };
		constructor(ctx: { waitUntil(promise: Promise<unknown>): void }, env: Env);
	}
}
