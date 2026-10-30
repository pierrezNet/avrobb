/**
 * Page Balises de l'administration (AP_Balises.php) : liste des balises du sujet ; ajout, édition,
 * ordre et suppression sont délégués à SubjectTagAdmin.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FormBody } from '../../http/forms.ts';
import { renderMessage } from '../../http/layout.ts';
import { type AdminLoaderControllerDeps, type AdminLoaderQuery, type PluginHandler, renderPlugin } from './pluginPage.ts';
import { SUBJECT_TAG_ACTIONS, SubjectTagAdmin } from './SubjectTagAdmin.ts';

export class LabelsPlugin implements PluginHandler {
	readonly #subjectTags: SubjectTagAdmin;

	constructor(private readonly deps: AdminLoaderControllerDeps) {
		this.#subjectTags = new SubjectTagAdmin(deps);
	}

	show(request: FastifyRequest<{ Querystring: AdminLoaderQuery }>, reply: FastifyReply): Promise<FastifyReply> {
		if (SUBJECT_TAG_ACTIONS.has(request.query.action ?? '')) return this.#subjectTags.show(request, reply);
		if (request.query.action !== undefined) return renderMessage(request, reply, this.deps, 400, this.deps.page.lang.common.badRequest);
		return this.#showList(request, reply);
	}

	submit(request: FastifyRequest<{ Querystring: AdminLoaderQuery; Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> {
		if (SUBJECT_TAG_ACTIONS.has(request.query.action ?? '')) return this.#subjectTags.submit(request, reply);
		return renderMessage(request, reply, this.deps, 400, this.deps.page.lang.common.badRequest);
	}

	#showList(request: FastifyRequest<{ Querystring: AdminLoaderQuery }>, reply: FastifyReply): Promise<FastifyReply> {
		const t = this.deps.page.lang.adminPlugins.labels;
		const { done } = request.query;
		const notices: Record<string, string> = { tag_saved: t.subjectTagSaved, tag_deleted: t.subjectTagDeleted };
		const renamed = /^tag_renamed_(\d+)$/.exec(done ?? '');
		const subjectTags = this.#subjectTags.listView(request.board.subjectTags);
		return renderPlugin(this.deps, request, reply, 'AP_Balises.php', 'admin_plugin_labels.njk', t.title, {
			notice: renamed?.[1] !== undefined ? t.subjectTagRenamed(Number(renamed[1])) : (notices[done ?? ''] ?? null),
			subjectTagGroups: (['project', 'other'] as const).map((group) => ({
				name: t.groups[group] ?? group,
				tags: subjectTags.filter((tag) => tag.group === group),
			})),
			addSubjectTagHref: 'admin_loader.php?plugin=AP_Balises.php&action=tag_add',
		});
	}
}
