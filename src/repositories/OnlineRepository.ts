/**
 * Table online et users.last_visit : écritures de check_cookie(), set_default_user(),
 * update_users_online() et de la déconnexion, reproduites requête pour requête pour que le PHP
 * voie la même liste de présents.
 */

import type { Db } from '../db/database.ts';
import type { GuestPresence, OnlineEntry, OnlinePurge } from '../services/presence.ts';

export interface OnlineWriter {
	/** Présence d'un invité, repérée par son adresse IP (online.ident). */
	findGuestPresence(ip: string): Promise<GuestPresence | null>;
	/** REPLACE INTO online : arrivée d'un membre (ident = pseudo) ou d'un invité (user_id 1, ident = IP). */
	enter(userId: number, ident: string, now: number): Promise<void>;
	/** Visite qui continue : logged = maintenant, et idle remis à 0. */
	refreshMember(userId: number, now: number): Promise<void>;
	refreshGuest(ip: string, now: number): Promise<void>;
	setLastVisit(userId: number, at: number): Promise<void>;
	listStale(before: number): Promise<OnlineEntry[]>;
	applyPurge(purge: OnlinePurge): Promise<void>;
	removeMember(userId: number): Promise<void>;
	removeIdent(ident: string): Promise<void>;
}

export class OnlineRepository implements OnlineWriter {
	constructor(private readonly db: Db) {}

	async findGuestPresence(ip: string): Promise<GuestPresence | null> {
		const row = await this.db
			.selectFrom('online')
			.select(['logged', 'idle', 'last_post', 'last_search'])
			.where('ident', '=', ip)
			.where('user_id', '=', 1)
			.executeTakeFirst();
		return row !== undefined ? { logged: row.logged, idle: row.idle === 1, lastPost: row.last_post, lastSearch: row.last_search } : null;
	}

	async enter(userId: number, ident: string, now: number): Promise<void> {
		// REPLACE INTO comme le PHP sous MySQL : la clé unique (user_id, ident) évite les doublons.
		await this.db.replaceInto('online').values({ user_id: userId, ident, logged: now, idle: 0 }).execute();
	}

	async refreshMember(userId: number, now: number): Promise<void> {
		await this.db.updateTable('online').set({ logged: now, idle: 0 }).where('user_id', '=', userId).execute();
	}

	async refreshGuest(ip: string, now: number): Promise<void> {
		await this.db.updateTable('online').set({ logged: now }).where('ident', '=', ip).execute();
	}

	async setLastVisit(userId: number, at: number): Promise<void> {
		await this.db.updateTable('users').set({ last_visit: at }).where('id', '=', userId).execute();
	}

	async listStale(before: number): Promise<OnlineEntry[]> {
		const rows = await this.db.selectFrom('online').select(['user_id', 'ident', 'logged', 'idle']).where('logged', '<', before).execute();
		return rows.map((row) => ({ userId: row.user_id, ident: row.ident, logged: row.logged, idle: row.idle === 1 }));
	}

	async applyPurge(purge: OnlinePurge): Promise<void> {
		if (purge.removeGuests.length + purge.endVisits.length + purge.markIdle.length === 0) return;

		await this.db.transaction().execute(async (trx) => {
			if (purge.removeGuests.length > 0)
				await trx.deleteFrom('online').where('ident', 'in', purge.removeGuests).where('user_id', '=', 1).execute();
			for (const visit of purge.endVisits) {
				await trx.updateTable('users').set({ last_visit: visit.logged }).where('id', '=', visit.userId).execute();
				await trx.deleteFrom('online').where('user_id', '=', visit.userId).execute();
			}
			if (purge.markIdle.length > 0) await trx.updateTable('online').set({ idle: 1 }).where('user_id', 'in', purge.markIdle).execute();
		});
	}

	async removeMember(userId: number): Promise<void> {
		await this.db.deleteFrom('online').where('user_id', '=', userId).execute();
	}

	async removeIdent(ident: string): Promise<void> {
		await this.db.deleteFrom('online').where('ident', '=', ident).execute();
	}
}
