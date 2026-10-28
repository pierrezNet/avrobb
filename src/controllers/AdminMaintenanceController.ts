/**
 * Maintenance du forum (admin_maintenance.php), réservée aux administrateurs : mode maintenance,
 * reconstruction de l'index de recherche par lots, seuil des discussions anciennes.
 *
 * Écart : l'élagage de FluxBB (suppression définitive des anciennes discussions) n'est pas repris.
 * AvroBB sépare plutôt le contenu « chaud » du contenu « froid » : au-delà d'un seuil réglé ici
 * (o_cold_topic_days), une discussion passe dans la page « Anciennes discussions » de son forum.
 *
 * Ajout : le mode maintenance (o_maintenance et son message), réglé dans admin_options.php par
 * FluxBB, se règle ici, avec un aperçu de la page vue par les membres (?preview=1).
 *
 * Ajout : « Vider les caches » supprime les fichiers cache/cache_*.php du PHP, qui les régénère
 * (FluxBB demandait de les effacer à la main).
 *
 * Écart assumé : chaque lot de la reconstruction est envoyé en POST avec le jeton CSRF (le PHP
 * enchaînait des GET qui écrivaient dans l'index) ; un petit script enchaîne les étapes.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import type { ConfigCache } from '../repositories/ConfigLoader.ts';
import type { ConfigStore } from '../repositories/ConfigRepository.ts';
import type { MaintenanceStore } from '../repositories/MaintenanceRepository.ts';
import type { PhpCacheName, PhpCacheStore } from '../repositories/PhpCacheFiles.ts';
import type { StopwordsReader } from '../repositories/StopwordsLoader.ts';
import { changedOptions, readMaintenanceForm } from '../services/adminOptions.ts';
import { indexWords } from '../services/searchIndex.ts';
import { adminDenied, renderAdminPage } from './adminPage.ts';
import { positiveInt } from './params.ts';

export interface AdminMaintenanceControllerDeps extends LayoutDeps {
	maintenance: MaintenanceStore;
	stopwords: StopwordsReader;
	configStore: ConfigStore;
	configCache: ConfigCache;
	phpCache: PhpCacheStore | null;
}

const PHP_CACHES: readonly PhpCacheName[] = ['config', 'bans', 'censoring', 'forums', 'smilies', 'users_info', 'admins'];

export interface AdminMaintenanceQuery {
	done?: string;
	/** Aperçu de la page de maintenance vue par les membres. */
	preview?: string;
}

export class AdminMaintenanceController {
	constructor(private readonly deps: AdminMaintenanceControllerDeps) {}

	show = async (request: FastifyRequest<{ Querystring: AdminMaintenanceQuery }>, reply: FastifyReply): Promise<FastifyReply> => {
		const denied = adminDenied(request, reply, this.deps, true);
		if (denied !== null) return denied;
		if (request.query.preview !== undefined) return this.#preview(request, reply);
		const t = this.deps.page.lang.adminMaintenance;
		const notices: Record<string, string> = {
			rebuilt: t.rebuilt,
			cleared: t.cacheCleared,
			mode: request.board.maintenance ? t.modeEnabled : t.modeDisabled,
			cold: t.coldSaved,
		};
		const firstPostId = await this.deps.maintenance.firstPostId();
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'maintenance', template: 'admin_maintenance.njk', title: t.title },
			{
				notice: notices[request.query.done ?? ''] ?? null,
				mode: {
					enabled: request.board.maintenance,
					message: request.board.maintenanceMessage,
					previewHref: 'admin_maintenance.php?preview=1',
				},
				firstPostId,
				coldTopicDays: request.board.coldTopicDays,
			},
		);
	};

	submit = async (request: FastifyRequest<{ Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> => {
		const denied = adminDenied(request, reply, this.deps, true);
		if (denied !== null) return denied;
		const action = field(request.body, 'action');
		if (action === 'rebuild') return this.#rebuild(request, reply);
		if (action === 'mode') return this.#saveMode(request, reply);
		if (action === 'cold') return this.#saveColdTopics(request, reply);
		if (action === 'clear_cache') {
			for (const name of PHP_CACHES) await this.deps.phpCache?.invalidate(name);
			await this.deps.phpCache?.invalidateFamily('quickjump');
			await this.deps.phpCache?.invalidateFamily('feed');
			await this.deps.configCache.invalidate();
			return reply.redirect('admin_maintenance.php?done=cleared', 303);
		}
		return renderMessage(request, reply, this.deps, 400, this.deps.page.lang.common.badRequest);
	};

	async #saveMode(request: FastifyRequest<{ Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> {
		const { lang } = this.deps.page;
		const values = readMaintenanceForm((key) => field(request.body, key), lang.adminOptions.defaults.maintenance);
		const changes = changedOptions(await this.deps.configStore.loadValues(), values);
		if (changes.size > 0) {
			await this.deps.configStore.updateValues(changes);
			await this.deps.configCache.invalidate();
		}
		return reply.redirect('admin_maintenance.php?done=mode#maintenance-mode', 303);
	}

	async #saveColdTopics(request: FastifyRequest<{ Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> {
		const raw = field(request.body, 'cold_days').trim();
		if (!/^\d{1,4}$/.test(raw)) return renderMessage(request, reply, this.deps, 400, this.deps.page.lang.adminMaintenance.coldDaysInvalid);
		// Clé propre à AvroBB, absente de la table tant qu'elle n'a pas été réglée : REPLACE.
		await this.deps.configStore.replaceValues(new Map([['o_cold_topic_days', String(Number(raw))]]));
		await this.deps.configCache.invalidate();
		return reply.redirect('admin_maintenance.php?done=cold#cold-topics', 303);
	}

	/** La page que voient les membres pendant la maintenance (les administrateurs passent outre). */
	#preview(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
		const { lang } = this.deps.page;
		return renderPage(
			request,
			reply,
			this.deps,
			'maintenance.njk',
			{ pageId: 'maint', titleParts: [request.board.boardTitle, lang.common.maintenance] },
			// o_maintenance_message : HTML saisi par l'administrateur, comme pour la vraie page.
			{
				messageHtml: request.board.maintenanceMessage,
				preview: { label: lang.adminMaintenance.previewNotice, backHref: 'admin_maintenance.php#maintenance-mode' },
			},
		);
	}

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
}
