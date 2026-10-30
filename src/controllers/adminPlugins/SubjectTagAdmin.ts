/**
 * Balises du sujet dans la page Balises de l'administration (actions tag_* de AP_Balises.php, propres
 * à AvroBB) : ajout, modification (renommage reporté dans les sujets existants), ordre et suppression.
 * La liste est enregistrée dans la table config (o_subject_tags).
 */

import type { SubjectTag } from '../../domain/models.ts';
import type { AppReply, AppRequest } from '../../http/context.ts';
import { type FormBody, field } from '../../http/forms.ts';
import { renderMessage } from '../../http/layout.ts';
import { renameTagInSubject } from '../../services/subjectPrefixes.ts';
import {
	moveSubjectTag,
	readSubjectTagForm,
	removeSubjectTag,
	SUBJECT_TAGS_KEY,
	serializeSubjectTags,
	upsertSubjectTag,
} from '../../services/subjectTagConfig.ts';
import { tagColors } from '../../services/subjectTags.ts';
import { type AdminLoaderControllerDeps, type AdminLoaderQuery, renderPlugin } from './pluginPage.ts';

const BASE = 'admin_loader.php?plugin=AP_Balises.php';

/** Actions des balises du sujet dans la page Balises. */
export const SUBJECT_TAG_ACTIONS: ReadonlySet<string> = new Set(['tag_add', 'tag_edit', 'tag_delete', 'tag_up', 'tag_down']);

export class SubjectTagAdmin {
	constructor(private readonly deps: AdminLoaderControllerDeps) {}

	/** Pastilles de la liste, pour la page principale. */
	listView(tags: readonly SubjectTag[]) {
		return tags.map((tag) => {
			const name = encodeURIComponent(tag.name);
			return {
				name: tag.name,
				group: tag.group,
				colors: tagColors(tag),
				editHref: `${BASE}&action=tag_edit&tag=${name}`,
				deleteHref: `${BASE}&action=tag_delete&tag=${name}`,
				upAction: `${BASE}&action=tag_up&tag=${name}`,
				downAction: `${BASE}&action=tag_down&tag=${name}`,
			};
		});
	}

	show(request: AppRequest<{ Querystring: AdminLoaderQuery }>, reply: AppReply): Promise<AppReply> {
		const { lang } = this.deps.page;
		const t = lang.adminPlugins.labels;
		const { action } = request.query;
		if (action === 'tag_add') return this.#renderForm(request, reply, null, null, []);
		const tag = this.#find(request);
		if (tag === undefined) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
		if (action === 'tag_edit') return this.#renderForm(request, reply, tag, null, []);
		if (action === 'tag_delete')
			return renderPlugin(this.deps, request, reply, 'AP_Balises.php', 'admin_plugin_subject_tag_delete.njk', t.subjectTagDeleteTitle, {
				info: t.subjectTagDeleteInfo(tag.name),
				deleteAction: `${BASE}&action=tag_delete&tag=${encodeURIComponent(tag.name)}`,
			});
		return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
	}

	async submit(request: AppRequest<{ Querystring: AdminLoaderQuery; Body: FormBody }>, reply: AppReply): Promise<AppReply> {
		const { lang } = this.deps.page;
		const t = lang.adminPlugins.labels;
		const tags = request.board.subjectTags;
		const { action } = request.query;
		const current = action === 'tag_add' ? null : (this.#find(request) ?? null);
		if (action !== 'tag_add' && current === null) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);

		if ((action === 'tag_up' || action === 'tag_down') && current !== null) {
			await this.#save(moveSubjectTag(tags, current.name, action === 'tag_up' ? -1 : 1));
			return reply.redirect(BASE, 303);
		}
		if (action === 'tag_delete' && current !== null) {
			if (field(request.body, 'delete_comply') === '') return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
			await this.#save(removeSubjectTag(tags, current.name));
			return reply.redirect(`${BASE}&done=tag_deleted`, 303);
		}
		if (action !== 'tag_add' && action !== 'tag_edit') return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);

		const form = readSubjectTagForm((name) => field(request.body, name), tags, current?.name ?? null);
		if (form.kind === 'error') {
			const sent = { name: field(request.body, 'name'), group: field(request.body, 'group'), color: field(request.body, 'color') };
			return this.#renderForm(request, reply, current, sent, [t.subjectTagErrors[form.error] ?? ''], 400);
		}
		const next = upsertSubjectTag(tags, form.tag, current?.name ?? null);
		await this.#save(next);
		let renamed = 0;
		if (current !== null && current.name !== form.tag.name) renamed = await this.#renameInSubjects(current.name, form.tag.name, next);
		return reply.redirect(`${BASE}&done=${renamed > 0 ? `tag_renamed_${renamed}` : 'tag_saved'}`, 303);
	}

	/** Reporte le nouveau nom dans les sujets qui portent l'ancien en tête ; renvoie leur nombre. */
	async #renameInSubjects(from: string, to: string, tags: readonly SubjectTag[]): Promise<number> {
		const store = this.deps.subjectPrefixes;
		const updates = (await store.findSubjectsContaining(`[${from}]`))
			.map((topic) => ({ id: topic.id, before: topic.subject, subject: renameTagInSubject(topic.subject, from, to, tags) }))
			.filter((update) => update.subject !== update.before)
			.map(({ id, subject }) => ({ id, subject }));
		await store.updateSubjects(updates);
		return updates.length;
	}

	async #save(tags: readonly SubjectTag[]): Promise<void> {
		await this.deps.configStore.replaceValues(new Map([[SUBJECT_TAGS_KEY, serializeSubjectTags(tags)]]));
		await this.deps.configCache.invalidate();
	}

	#find(request: AppRequest<{ Querystring: AdminLoaderQuery }>): SubjectTag | undefined {
		const name = request.query.tag ?? '';
		return request.board.subjectTags.find((tag) => tag.name === name);
	}

	#renderForm(
		request: AppRequest,
		reply: AppReply,
		tag: SubjectTag | null,
		sent: { name: string; group: string; color: string } | null,
		errors: string[],
		status = 200,
	): Promise<AppReply> {
		const t = this.deps.page.lang.adminPlugins.labels;
		reply.code(status);
		const name = sent?.name ?? tag?.name ?? '';
		const group = sent?.group ?? tag?.group ?? 'project';
		return renderPlugin(
			this.deps,
			request,
			reply,
			'AP_Balises.php',
			'admin_plugin_subject_tag_form.njk',
			tag !== null ? t.subjectTagEditTitle : t.subjectTagAddTitle,
			{
				errors,
				editing: tag !== null,
				submitAction: tag !== null ? `${BASE}&action=tag_edit&tag=${encodeURIComponent(tag.name)}` : `${BASE}&action=tag_add`,
				values: { name, group: group === 'other' ? 'other' : 'project', color: sent?.color ?? tag?.color ?? '#1d4ed8' },
			},
		);
	}
}
