/**
 * Maintenance du forum (admin_maintenance.php), réservée aux administrateurs : reconstruction de
 * l'index de recherche par lots et élagage des anciennes discussions.
 *
 * Ajout : « Vider les caches » supprime les fichiers cache/cache_*.php du PHP, qui les régénère
 * (FluxBB demandait de les effacer à la main).
 *
 * Écart assumé : chaque lot de la reconstruction est envoyé en POST avec le jeton CSRF (le PHP
 * enchaînait des GET qui écrivaient dans l'index) ; un petit script enchaîne les étapes.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage } from '../http/layout.ts';
import type { ConfigCache } from '../repositories/ConfigLoader.ts';
import type { ForumAdminStore } from '../repositories/ForumAdminRepository.ts';
import type { MaintenanceStore } from '../repositories/MaintenanceRepository.ts';
import type { PhpCacheName, PhpCacheStore } from '../repositories/PhpCacheFiles.ts';
import type { StopwordsReader } from '../repositories/StopwordsLoader.ts';
import { indexWords } from '../services/searchIndex.ts';
import { adminDenied, renderAdminPage } from './adminPage.ts';
import { positiveInt } from './params.ts';

export interface AdminMaintenanceControllerDeps extends LayoutDeps {
	maintenance: MaintenanceStore;
	forumAdmin: ForumAdminStore;
	stopwords: StopwordsReader;
	configCache: ConfigCache;
	phpCache: PhpCacheStore | null;
}

const PHP_CACHES: readonly PhpCacheName[] = ['config', 'bans', 'censoring', 'forums', 'smilies', 'users_info', 'admins'];

export interface AdminMaintenanceQuery {
	done?: string;
}

export class AdminMaintenanceController {
	constructor(private readonly deps: AdminMaintenanceControllerDeps) {}

	show = async (request: FastifyRequest<{ Querystring: AdminMaintenanceQuery }>, reply: FastifyReply): Promise<FastifyReply> => {
		const denied = adminDenied(request, reply, this.deps, true);
		if (denied !== null) return denied;
		const t = this.deps.page.lang.adminMaintenance;
		const notices: Record<string, string> = { rebuilt: t.rebuilt, pruned: t.pruned, cleared: t.cacheCleared };
		const [firstPostId, forums] = await Promise.all([this.deps.maintenance.firstPostId(), this.deps.forumAdmin.listForums()]);
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'maintenance', template: 'admin_maintenance.njk', title: t.title },
			{
				notice: notices[request.query.done ?? ''] ?? null,
				firstPostId,
				forums: forums.map((row) => ({ id: row.forumId, name: row.forumName, category: row.categoryName })),
			},
		);
	};

	submit = async (request: FastifyRequest<{ Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> => {
		const denied = adminDenied(request, reply, this.deps, true);
		if (denied !== null) return denied;
		const action = field(request.body, 'action');
		if (action === 'rebuild') return this.#rebuild(request, reply);
		if (action === 'prune') return this.#prune(request, reply);
		if (action === 'clear_cache') {
			for (const name of PHP_CACHES) await this.deps.phpCache?.invalidate(name);
			await this.deps.phpCache?.invalidateFamily('quickjump');
			await this.deps.phpCache?.invalidateFamily('feed');
			await this.deps.configCache.invalidate();
			return reply.redirect('admin_maintenance.php?done=cleared', 303);
		}
		return renderMessage(request, reply, this.deps, 400, this.deps.page.lang.common.badRequest);
	};

	/** Un lot de la reconstruction ; la page suivante relance le lot d'après, jusqu'au dernier message. */
	async #rebuild(request: FastifyRequest<{ Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> {
		const t = this.deps.page.lang.adminMaintenance;
		const { body } = request;
		const store = this.deps.maintenance;
		const perPage = positiveInt(field(body, 'i_per_page'));
		if (perPage < 1) return renderMessage(request, reply, this.deps, 400, t.perCycleNotInteger);
		const startAt = positiveInt(field(body, 'i_start_at'));
		if (field(body, 'i_empty_index') !== '') await store.emptySearchIndex();

		const [posts, stopwords] = await Promise.all([store.postsToIndex(startAt, perPage), this.deps.stopwords.load()]);
		for (const post of posts) await store.indexPost(post.id, indexWords(post.message, post.subject, stopwords));
		const last = posts.at(-1);
		const next = last !== undefined ? await store.nextPostId(last.id) : null;
		if (next === null) return reply.redirect('admin_maintenance.php?done=rebuilt', 303);
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'maintenance', template: 'admin_rebuild.njk', title: t.rebuilding },
			{ processed: t.processed(posts[0]?.id ?? startAt, last?.id ?? startAt), perPage, next },
		);
	}

	async #prune(request: FastifyRequest<{ Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> {
		const { lang, clock } = this.deps.page;
		const t = lang.adminMaintenance;
		const { body } = request;
		const withSticky = field(body, 'prune_sticky') === '1';
		const from = field(body, 'prune_from');
		const forums = await this.deps.forumAdmin.listForums();
		const forum = from === 'all' ? null : (forums.find((row) => row.forumId === positiveInt(from)) ?? undefined);
		if (forum === undefined) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
		const forumId = forum?.forumId ?? null;

		if (field(body, 'prune_comply') !== '') {
			const days = positiveInt(field(body, 'prune_days'));
			await this.deps.maintenance.prune(days > 0 ? clock() - days * 86400 : null, withSticky, forumId);
			return reply.redirect('admin_maintenance.php?done=pruned', 303);
		}

		const days = field(body, 'req_prune_days').trim();
		if (!/^\d{1,6}$/.test(days)) return renderMessage(request, reply, this.deps, 400, t.daysNotInteger);
		const count = await this.deps.maintenance.countPrunable(clock() - Number(days) * 86400, withSticky, forumId);
		if (count === 0) return renderMessage(request, reply, this.deps, 400, t.noOldTopics(days));
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'maintenance', template: 'admin_prune.njk', title: t.pruneHead },
			{
				info: t.confirmPruneInfo(days, forum !== null ? `« ${forum.forumName} »` : t.allForums, count),
				days,
				withSticky,
				from,
			},
		);
	}
}
