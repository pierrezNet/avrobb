/**
 * Traduction automatique d'un texte du forum : préparation (marqueurs), appel au modèle, contrôle de
 * la réponse, enregistrement. Lancée après la réponse (`waitUntil`) à la publication, à la
 * modification d'un message ou d'un forum, et rattrapée par la tâche planifiée (ScheduledTasks) pour
 * ce qui a échoué ou existait avant. Jamais à l'affichage.
 *
 * Une réponse inutilisable (marqueur perdu, JSON invalide) est notée comme « rien à traduire » : le
 * texte reste affiché tel quel, sans être redemandé à chaque passage. Un modèle indisponible, lui, ne
 * laisse rien : le texte sera repris au passage suivant.
 */

import type { TextModel } from '../adapters/textModel.ts';
import type { AppRequest, Logger } from '../http/context.ts';
import type { TranslationSource, TranslationWriter } from '../repositories/TranslationRepository.ts';
import {
	hasTranslatableText,
	NOTHING_TO_TRANSLATE,
	parseModelReply,
	protectText,
	restoreText,
	targetLocale,
	translationInstructions,
} from '../services/translation.ts';

export interface TranslationJobDeps {
	model: TextModel;
	translations: Pick<TranslationWriter, 'save'>;
	/** Noms propres jamais traduits (AvroBB, projets des balises de sujet). */
	keepNames: () => Promise<readonly string[]>;
	clock: () => number;
	logger: Logger;
}

/** Jetons de réponse : de quoi traduire le texte (environ 4 caractères par jeton) et le JSON autour. */
const maxTokens = (length: number): number => Math.min(4096, Math.ceil(length / 2) + 256);

/** Traduit et enregistre un texte ; false si le modèle n'a pas répondu (à reprendre plus tard). */
export async function translateSource(deps: TranslationJobDeps, source: TranslationSource): Promise<boolean> {
	const now = deps.clock();
	const prepared = protectText(source.text, source.kind, await deps.keepNames());
	if (!hasTranslatableText(prepared)) {
		await deps.translations.save(source, NOTHING_TO_TRANSLATE, '', now);
		return true;
	}
	const raw = await deps.model.complete(
		translationInstructions(source.kind, prepared.tokens.length > 0),
		prepared.text,
		maxTokens(prepared.text.length),
	);
	if (raw === null) return false;

	const reply = parseModelReply(raw, prepared);
	const text = reply !== null ? restoreText(reply.translation, prepared, source.kind) : null;
	if (reply === null || text === null || text.trim() === source.text.trim()) {
		if (reply === null || text === null)
			deps.logger.info({ kind: source.kind, id: source.id }, 'Traduction inutilisable, texte gardé tel quel');
		await deps.translations.save(source, NOTHING_TO_TRANSLATE, '', now);
		return true;
	}
	await deps.translations.save(source, targetLocale(reply.source), text, now);
	return true;
}

/** Traduit les textes les uns après les autres ; s'arrête au premier refus du modèle (quota, panne). */
export async function translateSources(deps: TranslationJobDeps, sources: readonly TranslationSource[]): Promise<number> {
	let done = 0;
	for (const source of sources) {
		try {
			if (!(await translateSource(deps, source))) break;
			done++;
		} catch (error) {
			deps.logger.error({ err: error, kind: source.kind, id: source.id }, 'Échec de la traduction automatique');
		}
	}
	return done;
}

/** Après la réponse : la page est envoyée sans attendre le modèle. */
export function translateInBackground(request: AppRequest, deps: TranslationJobDeps | null, sources: readonly TranslationSource[]): void {
	if (deps === null || sources.length === 0) return;
	request.waitUntil(translateSources(deps, sources));
}
