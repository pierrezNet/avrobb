/**
 * Modèle de langue de Workers AI (liaison `ai` de wrangler.jsonc), pour la traduction automatique
 * du contenu. L'adaptateur ne fait qu'envoyer une consigne et un texte, et rendre la réponse brute :
 * la préparation du texte et le contrôle de la réponse sont des règles pures
 * (services/translation.ts), testées sans modèle.
 *
 * Mistral Small 3.1 : bon en français, il suit les consignes (marqueurs, JSON). Environ 30
 * « neurones » par message traduit, dans le quota gratuit quotidien de Workers Paid (10 000).
 */

import type { Logger } from '../http/context.ts';

export interface TextModel {
	/** Réponse du modèle, ou null s'il n'a pas répondu (erreur, quota, délai). */
	complete(instructions: string, text: string, maxTokens: number): Promise<string | null>;
}

/** Sous-ensemble de la liaison Workers AI (`env.AI`). */
export interface AiBinding {
	run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

export const TRANSLATION_MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct';

export class WorkersAiTextModel implements TextModel {
	constructor(
		private readonly ai: AiBinding,
		private readonly logger: Logger,
		private readonly model = TRANSLATION_MODEL,
	) {}

	async complete(instructions: string, text: string, maxTokens: number): Promise<string | null> {
		try {
			const result = await this.ai.run(this.model, {
				messages: [
					{ role: 'system', content: instructions },
					{ role: 'user', content: text },
				],
				max_tokens: maxTokens,
				// Traduction : le moins d'invention possible.
				temperature: 0.2,
			});
			const response = (result as { response?: unknown } | null)?.response;
			// Selon le modèle, une réponse JSON arrive déjà décodée.
			if (typeof response === 'string') return response;
			if (typeof response === 'object' && response !== null) return JSON.stringify(response);
			this.logger.error({ model: this.model }, 'Réponse de Workers AI sans texte');
			return null;
		} catch (error) {
			this.logger.error({ model: this.model, err: error }, 'Workers AI indisponible');
			return null;
		}
	}
}
