/**
 * Modèles de vue des plugins d'administration portés. Fonctions pures.
 */

import type { Lang } from '../lang/fr/index.ts';
import type { PremiumMember } from '../repositories/PremiumAdminRepository.ts';
import { fileSize } from '../services/numberFormat.ts';

/** Temps restant d'un membre PREMIUM, dans la plus grande unité non nulle, comme le plugin. */
export function premiumRemaining(endsAt: number, now: number, lang: Lang): string {
	const t = lang.adminPlugins.premium;
	const left = endsAt - now;
	if (left < 0) return t.endPeriod;
	const days = Math.floor(left / 86400);
	const hours = Math.floor((left % 86400) / 3600);
	const minutes = Math.floor((left % 3600) / 60);
	if (days > 0) return t.days(days);
	if (hours > 0) return t.hours(hours);
	return t.minutes(minutes);
}

export function buildPremiumMembers(members: readonly PremiumMember[], now: number, lang: Lang) {
	return members.map((member) => ({
		id: member.id,
		username: member.username,
		email: member.email,
		groupTitle: member.groupTitle,
		remaining: premiumRemaining(member.endsAt, now, lang),
	}));
}

/** Fichiers des membres (plugin Uploadile) : nom sans extension, taille lisible, type. */
export function buildUploadileFiles(
	files: readonly { ownerId: number; owner: string; name: string; size: number; url: string; thumbnailUrl: string | null }[],
) {
	return files.map((file) => {
		const dot = file.name.lastIndexOf('.');
		return {
			...file,
			key: `${file.ownerId}/${file.name}`,
			label: dot > 0 ? file.name.slice(0, dot) : file.name,
			type: dot > 0 ? file.name.slice(dot + 1) : '',
			sizeText: fileSize(file.size),
		};
	});
}
