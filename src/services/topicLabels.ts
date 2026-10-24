/**
 * Balises de sujet de PV : préfixe ajouté au sujet, comme dans viewtopic.php (mod PunBalise 2.5).
 */

import type { TopicLabel } from '../domain/models.ts';

/** « [Réglé] », « *Réglé* » ou « #Réglé# » selon balises.baltype. */
export function labelText(label: TopicLabel): string {
	if (label.style === 'stars') return `*${label.name}*`;
	if (label.style === 'hashes') return `#${label.name}#`;
	return `[${label.name}]`;
}

/**
 * Sujet précédé de ses balises. Le PHP les préfixe une à une dans l'ordre de position : la dernière
 * se retrouve donc en tête.
 */
export function labelledSubject(subject: string, labels: readonly TopicLabel[]): string {
	return labels.reduce((text, label) => `${labelText(label)} ${text}`, subject);
}
