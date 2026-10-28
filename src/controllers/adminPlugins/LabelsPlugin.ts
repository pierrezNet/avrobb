/**
 * Plugin PunBalise (AP_Balises.php) : ajout, édition et suppression des balises de sujets.
 * L'installation, la mise à jour et la désinstallation du mod restent sur le PHP.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type FormBody, field } from '../../http/forms.ts';
import { renderMessage } from '../../http/layout.ts';
import type { LabelRow } from '../../repositories/LabelAdminRepository.ts';
import { readLabelForm } from '../../services/labelForm.ts';
import { type AdminLoaderControllerDeps, type AdminLoaderQuery, type PluginHandler, renderPlugin } from './pluginPage.ts';

export class LabelsPlugin implements PluginHandler {
	constructor(private readonly deps: AdminLoaderControllerDeps) {}

	show(request: FastifyRequest<{ Querystring: AdminLoaderQuery }>, reply: FastifyReply): Promise<FastifyReply> {
		return this.#showLabels(request, reply);
	}

	submit(request: FastifyRequest<{ Querystring: AdminLoaderQuery; Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> {
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
		const notices: Record<string, string> = { added: t.added, updated: t.updated, deleted: t.deleted };
		const [labels, version] = await Promise.all([this.deps.labelAdmin.listLabels(), this.deps.labelAdmin.installedVersion()]);
		return renderPlugin(this.deps, request, reply, 'AP_Balises.php', 'admin_plugin_labels.njk', t.title, {
			notice: notices[done ?? ''] ?? null,
			version,
			labels: labels.map((label) => ({
				...label,
				// Couleur reprise dans un attribut style : seulement une valeur #RRGGBB.
				safeColor: /^#[0-9a-f]{6}$/i.test(label.color) ? label.color : null,
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
		if (label === null) {
			const exists = (await store.listLabels()).some((other) => other.name === form.values.name && other.style === form.values.style);
			if (exists) return this.#renderLabelForm(request, reply, null, sent, [t.errors.duplicate], 400);
			await store.addLabel(form.values);
			return done('added');
		}
		// Le nom d'une balise ne change pas (le PHP le renvoyait dans un champ caché).
		await store.updateLabel(label.id, { ...form.values, name: label.name, position: form.position });
		return done('updated');
	}
}
