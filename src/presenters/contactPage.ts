/**
 * Modèles de vue des formulaires de misc.php : e-mail à un membre et signalement d'un message.
 * Fonctions pures.
 */

import type { Lang } from '../lang/fr/index.ts';
import type { ReportTarget } from '../repositories/ReportRepository.ts';
import type { Censor } from '../services/censor.ts';
import { forumPath } from '../services/routes.ts';
import { type Crumb, crumbs } from './navigation.ts';

export interface EmailPageView {
	title: string;
	formAction: string;
	/** Page où revenir après l'envoi (déjà validée par safeRedirect()). */
	redirectUrl: string;
	subject: string;
	message: string;
	errors: readonly string[];
}

export function buildEmailPage(input: {
	recipientId: number;
	recipientName: string;
	redirectUrl: string;
	form: { subject: string; message: string };
	errors: readonly string[];
	lang: Lang;
}): EmailPageView {
	return {
		title: input.lang.misc.sendEmailTo(input.recipientName),
		formAction: `misc.php?email=${input.recipientId}`,
		redirectUrl: input.redirectUrl,
		subject: input.form.subject,
		message: input.form.message,
		errors: input.errors,
	};
}

export interface ReportPageView {
	crumbs: Crumb[];
	formAction: string;
	reason: string;
	errors: readonly string[];
}

export function buildReportPage(input: {
	target: ReportTarget;
	reason: string;
	errors: readonly string[];
	censor: Censor | null;
	lang: Lang;
}): ReportPageView {
	const { target, lang } = input;
	const subject = input.censor !== null ? input.censor(target.subject) : target.subject;
	return {
		crumbs: crumbs(
			{ label: lang.common.index, href: 'index.php' },
			{ label: target.forumName, href: forumPath(target.forumId, target.forumName) },
			{ label: subject, href: `viewtopic.php?pid=${target.postId}#p${target.postId}` },
			{ label: lang.misc.reportPost, href: `misc.php?report=${target.postId}` },
		),
		formAction: `misc.php?report=${target.postId}`,
		reason: input.reason,
		errors: input.errors,
	};
}
