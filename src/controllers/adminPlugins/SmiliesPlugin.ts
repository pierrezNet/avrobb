/**
 * Plugin Smilies (AP_Smilies.php) : table smilies et images du PHP (les pages Node affichent des émojis).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type FormBody, field } from '../../http/forms.ts';
import { renderMessage } from '../../http/layout.ts';
import { readImageInfo } from '../../services/images.ts';
import { type AdminLoaderControllerDeps, type AdminLoaderQuery, type PluginHandler, renderPlugin } from './pluginPage.ts';

/** Limites des images de smileys (configuration du plugin). */
const SMILEY_MAX_BYTES = 10240;
const SMILEY_MAX_SIZE = 20;

export class SmiliesPlugin implements PluginHandler {
	constructor(private readonly deps: AdminLoaderControllerDeps) {}

	show(request: FastifyRequest<{ Querystring: AdminLoaderQuery }>, reply: FastifyReply): Promise<FastifyReply> {
		return this.#renderSmilies(request, reply, [], request.query.done ?? null);
	}

	submit(request: FastifyRequest<{ Querystring: AdminLoaderQuery; Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> {
		return this.#saveSmilies(request, reply);
	}

	async #renderSmilies(
		request: FastifyRequest,
		reply: FastifyReply,
		errors: string[],
		done: string | null,
		status = 200,
	): Promise<FastifyReply> {
		const t = this.deps.page.lang.adminPlugins.smilies;
		const [smilies, images] = await Promise.all([this.deps.smileyAdmin.listSmilies(), this.deps.smileyImages.listImages()]);
		const notices: Record<string, string> = {
			edited: t.edited,
			removed: t.removed,
			created: t.created,
			deleted: t.imagesDeleted,
			uploaded: t.uploaded,
		};
		const base = this.deps.legacyBaseUrl;
		reply.code(status);
		return renderPlugin(this.deps, request, reply, 'AP_Smilies.php', 'admin_plugin_smilies.njk', t.title, {
			notice: done?.startsWith('notdeleted:') ? t.imagesNotDeleted(done.slice(11)) : (notices[done ?? ''] ?? null),
			errors,
			smilies: smilies.map((smiley) => ({
				...smiley,
				imageUrl: `${base}/img/smilies/${encodeURIComponent(smiley.image)}`,
				choices: images.map((name) => ({ name, selected: name === smiley.image })),
			})),
			images: images.map((name) => ({ name, url: `${base}/img/smilies/${encodeURIComponent(name)}` })),
		});
	}

	async #saveSmilies(request: FastifyRequest<{ Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> {
		const t = this.deps.page.lang.adminPlugins.smilies;
		const { body } = request;
		const store = this.deps.smileyAdmin;
		const fail = (message: string): Promise<FastifyReply> => this.#renderSmilies(request, reply, [message], null, 400);
		const done = async (name: string): Promise<FastifyReply> => {
			await this.deps.phpCache?.invalidate('smilies');
			return reply.redirect(`admin_loader.php?plugin=AP_Smilies.php&done=${encodeURIComponent(name)}`, 303);
		};
		const keys = (prefix: string): string[] =>
			Object.keys(body)
				.map((name) => (name.startsWith(`${prefix}[`) && name.endsWith(']') ? name.slice(prefix.length + 1, -1) : null))
				.filter((key): key is string => key !== null);

		if (field(body, 'reord') !== '') {
			const rows = [];
			const seen = new Set<string>();
			for (const smiley of await store.listSmilies()) {
				const text = field(body, `smilies_code[${smiley.id}]`).trim();
				if (text === '') return fail(t.errors.codeNone);
				if (seen.has(text)) return fail(t.errors.duplicate(text));
				seen.add(text);
				rows.push({
					id: smiley.id,
					text,
					image: field(body, `smilies_img[${smiley.id}]`).trim() || smiley.image,
					position: Number.parseInt(field(body, `smilies_order[${smiley.id}]`), 10) || 0,
				});
			}
			await store.updateSmilies(rows);
			return done('edited');
		}
		if (field(body, 'remove') !== '') {
			const ids = keys('rem_smilies')
				.map(Number)
				.filter((id) => Number.isSafeInteger(id) && id > 0);
			if (ids.length === 0) return fail(t.errors.noSmilies);
			await store.removeSmilies(ids);
			return done('removed');
		}
		if (field(body, 'add_smiley') !== '') {
			const text = field(body, 'smiley_code').trim();
			const image = field(body, 'smiley_image').trim();
			if (text === '') return fail(t.errors.codeNone);
			if ((await store.listSmilies()).some((smiley) => smiley.text === text)) return fail(t.errors.codeExists);
			if (image === '') return fail(t.errors.imageNone);
			await store.addSmiley(text, image);
			return done('created');
		}
		if (field(body, 'delete') !== '') {
			const names = keys('del_smilies');
			if (names.length === 0) return fail(t.errors.noImages);
			const used = new Set((await store.listSmilies()).map((smiley) => smiley.image));
			const affected = names.filter((name) => used.has(name));
			if (affected.length > 0) return fail(t.errors.imagesUsed(affected.join(', ')));
			const failed = [];
			for (const name of names) if (!(await this.deps.smileyImages.deleteImage(name))) failed.push(name);
			return done(failed.length > 0 ? `notdeleted:${failed.join(', ')}` : 'deleted');
		}
		if (field(body, 'add_image') !== '') {
			const file = request.uploads.get('req_file');
			if (file === undefined || file.data.length === 0) return fail(t.errors.noFile);
			const info = readImageInfo(file.data);
			if (info === null) return fail(t.errors.badType);
			if (file.data.length > SMILEY_MAX_BYTES) return fail(t.errors.tooLarge);
			if (info.width > SMILEY_MAX_SIZE || info.height > SMILEY_MAX_SIZE) return fail(t.errors.tooBig);
			// Nom d'origine jusqu'au premier point, comme le plugin.
			const base = (file.name.split(/[/\\]/).at(-1) ?? '').split('.')[0] ?? '';
			if (!/^[\w-]+$/.test(base)) return fail(t.errors.badName);
			await this.deps.smileyImages.saveImage(base, info.type, file.data);
			return reply.redirect('admin_loader.php?plugin=AP_Smilies.php&done=uploaded', 303);
		}
		return renderMessage(request, reply, this.deps, 400, this.deps.page.lang.common.badRequest);
	}
}
