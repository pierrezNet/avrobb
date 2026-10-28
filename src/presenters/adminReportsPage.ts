/**
 * Modèle de vue des signalements (admin_reports.php) : nouveaux signalements et 10 derniers
 * traités, avec ce qui reste de leur cible (forum, sujet, message). Fonction pure.
 */

import type { Report, Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';

export interface ReportView {
	id: number;
	heading: string;
	reporter: { href: string | null; label: string };
	/** Forum, sujet et message signalés ; `href` null quand l'élément a été supprimé. */
	location: { href: string | null; label: string }[];
	/** Motif, en lignes (le PHP remplaçait les retours à la ligne par <br />). */
	reasonLines: string[];
}

export interface AdminReportsView {
	pending: ReportView[];
	zapped: ReportView[];
	notice: string | null;
}

function reportView(report: Report, input: { viewer: Viewer; lang: Lang; dateWords: DateWords; now: number }): ReportView {
	const t = input.lang.admin;
	const date = (timestamp: number): string => formatTime(timestamp, viewerTimeSettings(input.viewer), input.dateWords, input.now);
	return {
		id: report.id,
		heading:
			report.zapped !== null
				? t.zappedSubhead(date(report.zapped.at), report.zapped.by?.username ?? t.na)
				: t.reportSubhead(date(report.created)),
		reporter:
			report.reporter !== null
				? { href: `profile.php?id=${report.reporter.id}`, label: report.reporter.username }
				: { href: null, label: t.deletedUser },
		location: [
			report.forum !== null ? { href: `viewforum.php?id=${report.forum.id}`, label: report.forum.name } : { href: null, label: t.deleted },
			report.topic !== null
				? { href: `viewtopic.php?id=${report.topic.id}`, label: report.topic.subject }
				: { href: null, label: t.deleted },
			report.postId !== null
				? { href: `viewtopic.php?pid=${report.postId}#p${report.postId}`, label: t.postId(report.postId) }
				: { href: null, label: t.deleted },
		],
		reasonLines: report.message.split('\n'),
	};
}

export function buildAdminReports(input: {
	viewer: Viewer;
	pending: readonly Report[];
	zapped: readonly Report[];
	lang: Lang;
	dateWords: DateWords;
	now: number;
	notice: string | null;
}): AdminReportsView {
	return {
		pending: input.pending.map((report) => reportView(report, input)),
		zapped: input.zapped.map((report) => reportView(report, input)),
		notice: input.notice,
	};
}
