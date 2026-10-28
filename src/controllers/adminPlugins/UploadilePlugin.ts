/**
 * Plugin Uploadile (AP_Uploadile.php) : réglages, installation et fichiers des membres. Ni la
 * désinstallation (elle supprime users.upload, dont dépendent les pages) ni la régénération des
 * miniatures (pas de bibliothèque d'images côté serveur) ne sont reprises.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type FormBody, field } from '../../http/forms.ts';
import { renderMessage } from '../../http/layout.ts';
import { buildUploadileFiles } from '../../presenters/adminPluginsPage.ts';
import { readUploadileSettings, UPLOADILE_DEFAULTS } from '../../services/adminPlugins.ts';
import { isListedUpload } from '../../services/uploads.ts';
import { type AdminLoaderControllerDeps, type AdminLoaderQuery, type PluginHandler, renderPlugin } from './pluginPage.ts';

export class UploadilePlugin implements PluginHandler {
	constructor(private readonly deps: AdminLoaderControllerDeps) {}

	show(request: FastifyRequest<{ Querystring: AdminLoaderQuery }>, reply: FastifyReply): Promise<FastifyReply> {
		return this.#renderUploadile(request, reply, request.query.done ?? null);
	}

	submit(request: FastifyRequest<{ Querystring: AdminLoaderQuery; Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> {
		return this.#saveUploadile(request, reply);
	}

	async #renderUploadile(request: FastifyRequest, reply: FastifyReply, done: string | null): Promise<FastifyReply> {
		const t = this.deps.page.lang.adminPlugins.uploadile;
		const config = request.board;
		const values = await this.deps.configStore.loadValues();
		const owners = await this.deps.uploads.listOwners();
		const names = await this.deps.userAdmin.findUsernames(owners);
		const files = [];
		for (const owner of owners) {
			const list = (await this.deps.uploads.list(owner)) ?? [];
			const present = new Set(list.map((file) => file.name));
			for (const file of list.filter((f) => isListedUpload(f.name, config.uploads)))
				files.push({
					ownerId: owner,
					owner: names.get(owner) ?? String(owner),
					name: file.name,
					size: file.size,
					url: this.deps.uploads.urlFor(owner, file.name),
					thumbnailUrl:
						config.uploads.thumbnails && present.has(`mini_${file.name}`) ? this.deps.uploads.urlFor(owner, `mini_${file.name}`) : null,
				});
		}
		const notices: Record<string, string> = { installed: t.installed, updated: t.updated, deleted: t.deleted, error: t.deleteError };
		return renderPlugin(this.deps, request, reply, 'AP_Uploadile.php', 'admin_plugin_uploadile.njk', t.title, {
			notice: notices[done ?? ''] ?? null,
			settings: {
				laws: values.get('o_uploadile_laws') ?? '',
				thumb: values.get('o_uploadile_thumb') === '1',
				thumbSize: values.get('o_uploadile_thumb_size') ?? '',
				maxsizeMember: values.get('o_uploadile_maxsize_member') ?? '',
				limitMember: values.get('o_uploadile_limit_member') ?? '',
				maxsizeModo: values.get('o_uploadile_maxsize_modo') ?? '',
				limitModo: values.get('o_uploadile_limit_modo') ?? '',
			},
			files: buildUploadileFiles(files),
		});
	}

	async #saveUploadile(request: FastifyRequest<{ Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> {
		const { body } = request;
		const done = (name: string): FastifyReply => reply.redirect(`admin_loader.php?plugin=AP_Uploadile.php&done=${name}`, 303);
		if (field(body, 'installation') !== '') {
			await this.deps.userAdmin.ensureUploadColumn();
			await this.deps.configStore.replaceValues(new Map(Object.entries(UPLOADILE_DEFAULTS)));
			await this.deps.configCache.invalidate();
			return done('installed');
		}
		if (field(body, 'update') !== '') {
			await this.deps.configStore.replaceValues(readUploadileSettings((name) => field(body, name)));
			await this.deps.configCache.invalidate();
			return done('updated');
		}
		if (field(body, 'supprimer') !== '') {
			// Case « <membre>/<fichier> » : le fichier visé seulement (le PHP supprimait ce nom chez tous les membres).
			const selected = Object.keys(body)
				.map((name) => /^delete\[(\d{1,10})\/(.+)\]$/.exec(name))
				.filter((match): match is RegExpExecArray => match !== null);
			let failed = false;
			const touched = new Set<number>();
			for (const [, owner, file] of selected) {
				if (owner === undefined || file === undefined) continue;
				const id = Number(owner);
				if (!(await this.deps.uploads.remove(id, file))) failed = true;
				if (request.board.uploads.thumbnails) await this.deps.uploads.remove(id, `mini_${file}`);
				touched.add(id);
			}
			for (const id of touched) {
				const remaining = (await this.deps.uploads.list(id)) ?? [];
				const used = remaining.filter((f) => isListedUpload(f.name, request.board.uploads)).reduce((sum, f) => sum + f.size, 0);
				await this.deps.profileStore.setUploadedBytes(id, used);
			}
			return done(failed ? 'error' : 'deleted');
		}
		return renderMessage(request, reply, this.deps, 400, this.deps.page.lang.common.badRequest);
	}
}
