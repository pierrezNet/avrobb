/**
 * Bannissements (admin_bans.php), pour les administrateurs et les modérateurs autorisés à bannir :
 * ajout (depuis un pseudo ou le lien « Bannir » d'un profil), modification, suppression et recherche.
 * Après chaque écriture, cache_bans.php est supprimé (generate_bans_cache() du PHP).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { GroupId } from '../domain/models.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage } from '../http/layout.ts';
import { paginationLinks } from '../presenters/navigation.ts';
import type { BanStore } from '../repositories/BanRepository.ts';
import type { PhpCacheStore } from '../repositories/PhpCacheFiles.ts';
import { BAN_SEARCH_FIELDS, BAN_SEARCH_ORDERS, readBanForm, readBanSearch, withLastIp } from '../services/banForm.ts';
import { formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import { isAdmin } from '../services/permissions.ts';
import { punTrim } from '../services/phpString.ts';
import { renderAdminPage } from './adminPage.ts';
import { positiveInt } from './params.ts';

const PER_PAGE = 50;

export interface AdminBansControllerDeps extends LayoutDeps {
	banStore: BanStore;
	phpCache: PhpCacheStore | null;
}

export type AdminBansQuery = Record<string, string | undefined>;

/** Décalage horaire du lecteur, en secondes ($pun_user['timezone'] + dst). */
const viewerOffset = (viewer: FastifyRequest['viewer']): number => (viewer.timezone + (viewer.dst ? 1 : 0)) * 3600;

/** Date d'expiration affichée dans le formulaire (gmdate('Y-m-d') au fuseau du lecteur). */
function expireInput(expire: number | null, offset: number): string {
	return expire !== null ? new Date((expire + offset) * 1000).toISOString().slice(0, 10) : '';
}

export class AdminBansController {
	constructor(private readonly deps: AdminBansControllerDeps) {}

	#denied(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> | null {
		const { viewer } = request;
		const allowed = isAdmin(viewer) || (viewer.group.isModerator && viewer.group.canModBanUsers);
		return allowed ? null : renderMessage(request, reply, this.deps, 403, this.deps.page.lang.common.noPermission);
	}

	show = async (request: FastifyRequest<{ Querystring: AdminBansQuery }>, reply: FastifyReply): Promise<FastifyReply> => {
		const denied = this.#denied(request, reply);
		if (denied !== null) return denied;
		const { lang } = this.deps.page;
		const t = lang.adminBans;
		const { query } = request;

		if (query.add_ban !== undefined) {
			const userId = positiveInt(query.add_ban);
			if (userId < 2) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
			return this.#startAdd(request, reply, { id: userId });
		}
		if (query.edit_ban !== undefined) {
			const ban = await this.deps.banStore.findBan(positiveInt(query.edit_ban));
			if (ban === null) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
			return this.#renderForm(
				request,
				reply,
				'edit',
				ban.id,
				{ ...ban, expireText: expireInput(ban.expire, viewerOffset(request.viewer)) },
				null,
				[],
			);
		}
		if (query.del_ban !== undefined) {
			const ban = await this.deps.banStore.findBan(positiveInt(query.del_ban));
			if (ban === null) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
			return renderAdminPage(
				request,
				reply,
				this.deps,
				{ active: 'bans', template: 'admin_ban_delete.njk', title: t.title },
				{ ban, formAction: `admin_bans.php?del_ban=${ban.id}` },
			);
		}
		if (query.find_ban !== undefined) return this.#results(request, reply);

		const notices: Record<string, string> = { added: t.added, edited: t.edited, removed: t.removed };
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'bans', template: 'admin_bans.njk', title: t.title },
			{
				notice: notices[query.done ?? ''] ?? null,
				fields: BAN_SEARCH_FIELDS.map((name) => ({
					name: `form[${name}]`,
					label: name === 'message' ? t.message : (t.orders[name] ?? name),
				})),
				orders: BAN_SEARCH_ORDERS.map((value) => ({ value, label: t.orders[value] ?? value })),
			},
		);
	};

	submit = async (request: FastifyRequest<{ Querystring: AdminBansQuery; Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> => {
		const denied = this.#denied(request, reply);
		if (denied !== null) return denied;
		const { lang, clock } = this.deps.page;
		const t = lang.adminBans;
		const { body, query } = request;
		const store = this.deps.banStore;

		if (query.del_ban !== undefined) {
			const ban = await store.findBan(positiveInt(query.del_ban));
			if (ban === null || field(body, 'del_ban_comply') === '')
				return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
			await store.removeBan(ban.id);
			await this.deps.phpCache?.invalidate('bans');
			return reply.redirect('admin_bans.php?done=removed', 303);
		}

		// Étape 1 : pseudo saisi, puis formulaire complet.
		if (field(body, 'add_ban') !== '') {
			const username = punTrim(field(body, 'new_ban_user'));
			return this.#startAdd(request, reply, username !== '' ? { username } : null);
		}

		if (field(body, 'add_edit_ban') === '') return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
		const mode = field(body, 'mode') === 'edit' ? 'edit' : 'add';
		const banId = mode === 'edit' ? positiveInt(field(body, 'ban_id')) : null;
		// Case « bannir aussi sa dernière IP » : l'adresse rejoint celles saisies (séparées par des espaces).
		const ips = withLastIp(field(body, 'ban_ip'), field(body, 'ban_last_ip'));
		const result = readBanForm((name) => (name === 'ban_ip' ? ips : field(body, name)), viewerOffset(request.viewer), clock());
		const sent = {
			username: field(body, 'ban_user'),
			ip: ips,
			email: field(body, 'ban_email'),
			message: field(body, 'ban_message'),
			expireText: field(body, 'ban_expire'),
		};
		if (result.kind === 'error') return this.#renderForm(request, reply, mode, banId, sent, null, [t.errors[result.error]], 400);
		if (result.ban.username !== null) {
			const target = await store.findTarget({ username: result.ban.username });
			const refusal = target !== null ? this.#protected(target) : null;
			if (refusal !== null) return this.#renderForm(request, reply, mode, banId, sent, null, [refusal], 400);
		}
		if (mode === 'edit') {
			if (banId === null || (await store.findBan(banId)) === null)
				return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
			await store.updateBan(banId, result.ban);
		} else await store.addBan(result.ban, request.viewer.id);
		await this.deps.phpCache?.invalidate('bans');
		return reply.redirect(`admin_bans.php?done=${mode === 'edit' ? 'edited' : 'added'}`, 303);
	};

	/** Les administrateurs et les modérateurs ne se bannissent pas. */
	#protected(target: { username: string; groupId: number; isModerator: boolean }): string | null {
		const t = this.deps.page.lang.adminBans;
		if (target.groupId === GroupId.Admin) return t.userIsAdmin(target.username);
		if (target.isModerator) return t.userIsMod(target.username);
		return null;
	}

	/** Formulaire complet d'un nouveau bannissement, prérempli d'après le compte visé s'il est donné. */
	async #startAdd(request: FastifyRequest, reply: FastifyReply, by: { id: number } | { username: string } | null): Promise<FastifyReply> {
		const t = this.deps.page.lang.adminBans;
		const empty = { username: '', ip: '', email: '', message: '', expireText: '' };
		if (by === null) return this.#renderForm(request, reply, 'add', null, empty, null, []);
		const target = await this.deps.banStore.findTarget(by);
		if (target === null) return renderMessage(request, reply, this.deps, 400, 'id' in by ? t.noUserId : t.noUser);
		const refusal = this.#protected(target);
		if (refusal !== null) return renderMessage(request, reply, this.deps, 400, refusal);
		// Dernière IP proposée par une case à cocher, non cochée : FluxBB la préremplissait, si bien
		// qu'un bannissement de compte bannissait aussi, sans qu'on y pense, tous ceux de cette adresse.
		const lastIp = await this.deps.banStore.lastKnownIp(target.id);
		return this.#renderForm(
			request,
			reply,
			'add',
			null,
			{ ...empty, username: target.username, email: target.email },
			target.id,
			[],
			200,
			lastIp,
		);
	}

	#renderForm(
		request: FastifyRequest,
		reply: FastifyReply,
		mode: 'add' | 'edit',
		banId: number | null,
		values: { username: string | null; ip: string | null; email: string | null; message: string | null; expireText: string },
		userId: number | null,
		errors: string[],
		status = 200,
		lastIp: string | null = null,
	): Promise<FastifyReply> {
		reply.code(status);
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'bans', template: 'admin_ban_edit.njk', title: this.deps.page.lang.adminBans.title },
			{
				mode,
				banId,
				values: {
					username: values.username ?? '',
					ip: values.ip ?? '',
					email: values.email ?? '',
					message: values.message ?? '',
					expire: values.expireText,
				},
				ipStatsHref: userId !== null ? `admin_users.php?ip_stats=${userId}` : null,
				lastIp: lastIp !== null && lastIp !== '' ? lastIp : null,
				errors,
			},
		);
	}

	async #results(request: FastifyRequest<{ Querystring: AdminBansQuery }>, reply: FastifyReply): Promise<FastifyReply> {
		const { lang, dateWords, clock } = this.deps.page;
		const t = lang.adminBans;
		const search = readBanSearch((name) => request.query[name] ?? '');
		if (search.kind === 'invalidDate') return renderMessage(request, reply, this.deps, 400, t.invalidSearchDate);
		const numPages = Math.ceil((await this.deps.banStore.countBans(search.criteria)) / PER_PAGE);
		const requested = positiveInt(request.query.p);
		const page = requested >= 1 && requested <= numPages ? requested : 1;
		const bans = await this.deps.banStore.searchBans(search.criteria, (page - 1) * PER_PAGE, PER_PAGE);
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'bans', template: 'admin_bans_results.njk', title: t.resultsHead },
			{
				bans: bans.map((ban) => ({
					...ban,
					expireText: ban.expire !== null ? formatTime(ban.expire, viewerTimeSettings(request.viewer), dateWords, clock(), true) : t.never,
					editHref: `admin_bans.php?edit_ban=${ban.id}`,
					deleteHref: `admin_bans.php?del_ban=${ban.id}`,
					creatorHref: ban.creator !== null ? `profile.php?id=${ban.creator.id}` : null,
				})),
				pagination: paginationLinks(numPages, page, (n) => `admin_bans.php?${search.queryString}${n > 1 ? `&p=${n}` : ''}`),
			},
		);
	}
}
