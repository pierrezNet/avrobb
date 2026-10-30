/**
 * Signalements (admin_reports.php) : nouveaux signalements à traiter, 10 derniers traités.
 * Réservé aux administrateurs et modérateurs.
 */

import type { AppReply, AppRequest } from '../http/context.ts';
import { type FormBody, field } from '../http/forms.ts';
import type { LayoutDeps } from '../http/layout.ts';
import { buildAdminReports } from '../presenters/adminReportsPage.ts';
import type { ReportStore } from '../repositories/ReportRepository.ts';
import { adminDenied, renderAdminPage } from './adminPage.ts';
import { positiveInt } from './params.ts';

export interface AdminReportsControllerDeps extends LayoutDeps {
	reportStore: ReportStore;
}

export interface AdminReportsQuery {
	done?: string;
}

export class AdminReportsController {
	constructor(private readonly deps: AdminReportsControllerDeps) {}

	show = async (request: AppRequest<{ Querystring: AdminReportsQuery }>, reply: AppReply): Promise<AppReply> => {
		const denied = adminDenied(request, reply, this.deps, false);
		if (denied !== null) return denied;
		const { lang } = this.deps.page;
		const [pending, zapped] = await Promise.all([this.deps.reportStore.listReports(false), this.deps.reportStore.listReports(true)]);
		const view = buildAdminReports({
			viewer: request.viewer,
			pending,
			zapped,
			lang,
			dateWords: this.deps.page.dateWords,
			now: this.deps.page.clock(),
			notice: request.query.done === 'zapped' ? lang.admin.reportZapped : null,
		});
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'reports', template: 'admin_reports.njk', title: lang.admin.reports },
			view,
		);
	};

	/** Bouton « Marquer comme traité » d'un signalement (zap_id). */
	zap = async (request: AppRequest<{ Body: FormBody }>, reply: AppReply): Promise<AppReply> => {
		const denied = adminDenied(request, reply, this.deps, false);
		if (denied !== null) return denied;
		const id = positiveInt(field(request.body, 'zap_id'));
		if (id > 0) await this.deps.reportStore.zap(id, request.viewer.id, this.deps.page.clock());
		return reply.redirect('admin_reports.php?done=zapped', 303);
	};
}
