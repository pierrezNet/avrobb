/**
 * Comptes SSO (table users) : recherche par (fournisseur, identifiant), création à la première
 * connexion, « me déconnecter de partout » (users.session_version) et suppression de son compte
 * par le membre, ses messages publics gardés sous un nom anonyme.
 */

import type { Compilable, Db } from '../db/database.ts';
import { GUEST_USER_ID } from '../domain/models.ts';
import type { OAuthProviderId } from '../services/oauth.ts';
import { removeFromModeratorsWrites } from './UserAdminRepository.ts';

export interface NewAccount {
	provider: OAuthProviderId;
	providerId: string;
	username: string;
	email: string;
	groupId: number;
	registeredAt: number;
	ip: string;
	/** Réglages par défaut du forum (o_default_*). */
	timezone: number;
	dst: boolean;
	style: string;
	emailSetting: number;
}

export interface AccountStore {
	/** Compte et numéro de session (pour le cookie), ou null. */
	findByProvider(provider: OAuthProviderId, providerId: string): Promise<{ id: number; sessionVersion: number } | null>;
	/** Identifiant du compte créé, ou null si le pseudo vient d'être pris (index unique). */
	createAccount(account: NewAccount): Promise<number | null>;
	/** Incrémente users.session_version : toutes les sessions ouvertes deviennent invalides. */
	endAllSessions(userId: number): Promise<void>;
	/**
	 * Supprime le compte : données personnelles, abonnements, brouillons, messagerie, images de la
	 * galerie ; messages publics et discussions gardés sous `anonymousName`.
	 */
	deleteAccount(userId: number, username: string, anonymousName: string): Promise<void>;
}

export class AccountRepository implements AccountStore {
	constructor(private readonly db: Db) {}

	async findByProvider(provider: OAuthProviderId, providerId: string): Promise<{ id: number; sessionVersion: number } | null> {
		const row = await this.db
			.selectFrom('users')
			.select(['id', 'session_version'])
			.where('provider', '=', provider)
			.where('provider_id', '=', providerId)
			.executeTakeFirst();
		return row === undefined ? null : { id: row.id, sessionVersion: row.session_version };
	}

	async createAccount(account: NewAccount): Promise<number | null> {
		try {
			const result = await this.db
				.insertInto('users')
				.values({
					group_id: account.groupId,
					username: account.username,
					email: account.email,
					provider: account.provider,
					provider_id: account.providerId,
					registered: account.registeredAt,
					registration_ip: account.ip,
					last_visit: account.registeredAt,
					timezone: account.timezone,
					dst: account.dst ? 1 : 0,
					style: account.style,
					email_setting: account.emailSetting,
					language: 'French',
				})
				.executeTakeFirstOrThrow();
			return Number(result.insertId);
		} catch (error) {
			// Pseudo pris entre la vérification et l'écriture : l'appelant essaie la variante suivante.
			if (String(error).includes('UNIQUE') && String(error).includes('username')) return null;
			throw error;
		}
	}

	async endAllSessions(userId: number): Promise<void> {
		await this.db
			.updateTable('users')
			.set((eb) => ({ session_version: eb('session_version', '+', 1) }))
			.where('id', '=', userId)
			.execute();
	}

	async deleteAccount(userId: number, username: string, anonymousName: string): Promise<void> {
		const writes: Compilable[] = [
			...(await removeFromModeratorsWrites(this.db, [userId])),
			this.db.deleteFrom('topic_subscriptions').where('user_id', '=', userId),
			this.db.deleteFrom('forum_subscriptions').where('user_id', '=', userId),
			this.db.deleteFrom('online').where('user_id', '=', userId),
			this.db.deleteFrom('brouillons').where('poster_id', '=', userId),
			this.db.deleteFrom('messages').where('owner', '=', userId),
			this.db.deleteFrom('gallery').where('user_id', '=', userId),
			this.db.deleteFrom('search_cache').where('ident', '=', username),
			// Messages publics gardés pour la cohérence des discussions, sans nom ni adresse IP.
			this.db
				.updateTable('posts')
				.set({ poster_id: GUEST_USER_ID, poster: anonymousName, poster_ip: null, poster_email: null })
				.where('poster_id', '=', userId),
			this.db.updateTable('posts').set({ edited_by: anonymousName }).where('edited_by', '=', username),
			this.db.updateTable('topics').set({ poster: anonymousName }).where('poster', '=', username),
			this.db.updateTable('topics').set({ last_poster: anonymousName }).where('last_poster', '=', username),
			this.db.updateTable('forums').set({ last_poster: anonymousName }).where('last_poster', '=', username),
			// Exemplaires des conversations détenus par les autres membres.
			this.db.updateTable('messages').set({ sender: anonymousName, sender_ip: '' }).where('sender_id', '=', userId),
			this.db.updateTable('messages').set({ last_poster: anonymousName }).where('last_poster', '=', username),
			this.db.deleteFrom('users').where('id', '=', userId),
		];
		await this.db.batch(writes);
	}
}
