/**
 * Règles des blocs d'activité de l'accueil (AvroBB) : image d'une discussion, répartition des
 * discussions de la semaine par simulateur. Fonctions pures.
 */

import type { SubjectTag } from '../domain/models.ts';
import { splitPrefixes } from './subjectPrefixes.ts';

/** Semaine glissante des blocs de l'accueil, en secondes. */
export const HOME_WEEK = 7 * 86400;

const IMG = /\[img(?:=[^\]]*)?\]\s*(https?:\/\/[^\s[\]"<>]+?)\s*\[\/img\]/gi;

/** Dernière image ([img]) d'un message BBCode, en http(s) seulement ; null s'il n'y en a pas. */
export function lastImageUrl(message: string): string | null {
	let url: string | null = null;
	for (const match of message.matchAll(IMG)) url = match[1] ?? url;
	return url;
}

export interface SimulatorShare {
	tag: SubjectTag;
	count: number;
	/** Part des discussions balisées par un simulateur, arrondie (somme proche de 100). */
	percent: number;
}

/** Discussions actives par balise de simulateur, de la plus fréquente à la moins fréquente. */
export function simulatorShares(subjects: readonly string[], tags: readonly SubjectTag[]): SimulatorShare[] {
	const simulators = tags.filter((tag) => tag.group === 'simulator');
	const counts = new Map<string, number>();
	for (const subject of subjects) {
		for (const name of splitPrefixes(subject, tags).prefixes) {
			if (simulators.some((tag) => tag.name === name)) counts.set(name, (counts.get(name) ?? 0) + 1);
		}
	}
	const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
	return simulators
		.map((tag) => ({ tag, count: counts.get(tag.name) ?? 0 }))
		.filter((share) => share.count > 0)
		.sort((a, b) => b.count - a.count)
		.map((share) => ({ ...share, percent: Math.round((share.count / total) * 100) }));
}
