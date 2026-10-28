/**
 * Page Balises de l'administration (AP_Balises.php) : balises du sujet (déléguées à SubjectTagAdmin)
 * et balises de modération PunBalise (ajout, édition, suppression).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type FormBody, field } from '../../http/forms.ts';
import { renderMessage } from '../../http/layout.ts';
import type { LabelRow } from '../../repositories/LabelAdminRepository.ts';
import { readLabelForm } from '../../services/labelForm.ts';
import { readableOn } from '../../services/subjectTags.ts';
import { type AdminLoaderControllerDeps, type AdminLoaderQuery, type PluginHandler, renderPlugin } from './pluginPage.ts';
import { SUBJECT_TAG_ACTIONS, SubjectTagAdmin } from './SubjectTagAdmin.ts';

export class LabelsPlugin implements PluginHandler {
	readonly #subjectTags: SubjectTagAdmin;

	constructor(private readonly deps: AdminLoaderControllerDeps) {
		this.#subjectTags = new SubjectTagAdmin(deps);
	}

	show(request: FastifyRequest<{ Querystring: AdminLoaderQuery }>, reply: FastifyReply): Promise<FastifyReply> {
		if (SUBJECT_TAG_ACTIONS.has(request.query.action ?? '')) return this.#subjectTags.show(request, reply);
		return this.#showLabels(request, reply);
	}

	submit(request: FastifyRequest<{ Querystring: AdminLoaderQuery; Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> {
		if (SUBJECT_TAG_ACTIONS.has(request.query.action ?? '')) return this.#subjectTags.submit(request, reply);
		return this.#saveLabels(request, reply);
	}

	async #showLabels(request: FastifyRequest<{ Querystring: AdminLoaderQuery }>, reply: FastifyReply): Promise<FastifyReply> {
		const { lang } = this.deps.page;
		const t = lang.adminPlugins.labels;
		const { action, done } = request.query;
		if (action === 'add') return this.#renderLabelForm(request, reply, null, null, []);
		if (action === 'edit' || action === 'delete') {
			const label = await this.deps.labelAdmin.findLabel(Number.parseInt(request.query.id ?? '', 10));
			if (label === null) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
			if (action === 'edit') return this.#renderLabelForm(request, reply, label, null, []);
			return renderPlugin(this.deps, request, reply, 'AP_Balises.php', 'admin_plugin_label_delete.njk', t.deleteTitle, {
				label,
				deleteAction: `admin_loader.php?plugin=AP_Balises.php&action=delete&id=${label.id}`,
			});
		}
		const notices: Record<string, string> = {
			added: t.added,
			updated: t.updated,
			deleted: t.deleted,
			tag_saved: t.subjectTagSaved,
			tag_deleted: t.subjectTagDeleted,
		};
		const renamed = /^tag_renamed_(\d+)$/.exec(done ?? '');
		const labels = await this.deps.labelAdmin.listLabels();
		const subjectTags = this.#subjectTags.listView(request.board.subjectTags);
		return renderPlugin(this.deps, request, reply, 'AP_Balises.php', 'admin_plugin_labels.njk', t.title, {
			notice: renamed?.[1] !== undefined ? t.subjectTagRenamed(Number(renamed[1])) : (notices[done ?? ''] ?? null),
			subjectTagGroups: (['simulator', 'other'] as const).map((group) => ({
				name: t.groups[group] ?? group,
				tags: subjectTags.filter((tag) => tag.group === group),
			})),
			addSubjectTagHref: 'admin_loader.php?plugin=AP_Balises.php&action=tag_add',
			labels: labels.map((label) => ({
				...label,
				// Pastille de la couleur de la balise (#RRGGBB validé, sinon gris), texte lisible.
				colors: readableOn(/^#[0-9a-f]{6}$/i.test(label.color) ? label.color : '#475569'),
				styleName: t.styles[label.style] ?? '',
				editHref: `admin_loader.php?plugin=AP_Balises.php&action=edit&id=${label.id}`,
				deleteHref: `admin_loader.php?plugin=AP_Balises.php&action=delete&id=${label.id}`,
			})),
			addHref: 'admin_loader.php?plugin=AP_Balises.php&action=add',
		});
	}

	#renderLabelForm(
		request: FastifyRequest,
		reply: FastifyReply,
		label: LabelRow | null,
		sent: Record<string, string> | null,
		errors: string[],
		status = 200,
	): Promise<FastifyReply> {
		const t = this.deps.page.lang.adminPlugins.labels;
		const value = (name: string, fallback: string): string => sent?.[name] ?? fallback;
		const flagOf = (name: string, current: boolean | undefined): boolean => (sent !== null ? sent[name] === '1' : current === true);
		reply.code(status);
		return renderPlugin(
			this.deps,
			request,
			reply,
			'AP_Balises.php',
			'admin_plugin_label_form.njk',
			label !== null ? t.editTitle : t.addTitle,
			{
				errors,
				editing: label !== null,
				submitAction:
					label !== null
						? `admin_loader.php?plugin=AP_Balises.php&action=edit&id=${label.id}`
						: 'admin_loader.php?plugin=AP_Balises.php&action=add',
				values: {
					name: value('nom', label?.name ?? ''),
					color: value('color1', label?.color ?? '#FF0000'),
					bold: flagOf('gras', label?.bold),
					italic: flagOf('ital', label?.italic),
					underline: flagOf('souli', label?.underline),
					position: value('position', String(label?.position ?? 0)),
					style: Number(value('baltype', String(label?.style ?? 0))),
					moderatorVisible: flagOf('affich', label?.moderatorVisible),
				},
				styles: t.styles.map((name, index) => ({ value: index, name })),
			},
		);
	}

	async #saveLabels(
		request: FastifyRequest<{ Querystring: AdminLoaderQuery; Body: FormBody }>,
		reply: FastifyReply,
	): Promise<FastifyReply> {
		const { lang } = this.deps.page;
		const t = lang.adminPlugins.labels;
		const { body, query } = request;
		const store = this.deps.labelAdmin;
		const done = async (name: string): Promise<FastifyReply> => {
			await this.deps.configCache.invalidate();
			return reply.redirect(`admin_loader.php?plugin=AP_Balises.php&done=${name}`, 303);
		};
		const label = query.action === 'add' ? null : await store.findLabel(Number.parseInt(query.id ?? '', 10));
		if (query.action !== 'add' && label === null) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);

		if (query.action === 'delete' && label !== null) {
			if (field(body, 'delete_comply') === '') return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
			await store.deleteLabel(label.id);
			return done('deleted');
		}
		if (query.action !== 'add' && query.action !== 'edit') return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);

		const sent = Object.fromEntries(Object.entries(body).map(([name, value]) => [name, typeof value === 'string' ? value : '']));
		const form = readLabelForm((name) => field(body, name));
		if (form.kind === 'error') return this.#renderLabelForm(request, reply, label, sent, [t.errors[form.error]], 400);
		// Même nom et même type qu'une autre balise : refusé (le PHP ne contrôlait que l'ajout).
		const duplicate = (await store.listLabels()).some(
			(other) => other.id !== label?.id && other.name === form.values.name && other.style === form.values.style,
		);
		if (duplicate) return this.#renderLabelForm(request, reply, label, sent, [t.errors.duplicate], 400);
		if (label === null) {
			await store.addLabel(form.values);
			return done('added');
		}
		// Écart voulu : le nom se modifie (le PHP le figeait dans un champ caché).
		await store.updateLabel(label.id, { ...form.values, position: form.position });
		return done('updated');
	}
}
