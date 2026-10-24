/**
 * Contacts entre membres (misc.php) : destinataire du formulaire d'e-mail, et dates des derniers
 * e-mails et signalements de l'expéditeur pour l'anti-flood (g_email_flood, g_report_flood).
 */

import type { Db } from '../db/database.ts';
import { GUEST_USER_ID } from '../domain/models.ts';

export interface Recipient {
	username: string;
	email: string;
	/** users.email_setting : 0 adresse visible, 1 formulaire, 2 aucun contact. */
	emailSetting: number;
}

/** Délais de l'expéditeur : dernier envoi et intervalle minimal de son groupe, en secondes. */
export interface SenderLimits {
	lastEmailSent: number | null;
	emailFlood: number;
	lastReportSent: number | null;
	reportFlood: number;
}

export interface ContactStore {
	/** Membre destinataire (jamais l'invité). */
	findRecipient(userId: number): Promise<Recipient | null>;
	findSenderLimits(userId: number): Promise<SenderLimits | null>;
	markEmailSent(userId: number, at: number): Promise<void>;
	markReportSent(userId: number, at: number): Promise<void>;
}

export class ContactRepository implements ContactStore {
	constructor(private readonly db: Db) {}

	async findRecipient(userId: number): Promise<Recipient | null> {
		const row = await this.db
			.selectFrom('users')
			.select(['username', 'email', 'email_setting'])
			.where('id', '=', userId)
			.where('id', '>', GUEST_USER_ID)
			.executeTakeFirst();
		return row !== undefined ? { username: row.username, email: row.email, emailSetting: row.email_setting } : null;
	}

	async findSenderLimits(userId: number): Promise<SenderLimits | null> {
		const row = await this.db
			.selectFrom('users as u')
			.innerJoin('groups as g', 'g.g_id', 'u.group_id')
			.select(['u.last_email_sent', 'u.last_report_sent', 'g.g_email_flood', 'g.g_report_flood'])
			.where('u.id', '=', userId)
			.executeTakeFirst();
		return row !== undefined
			? {
					lastEmailSent: row.last_email_sent,
					emailFlood: row.g_email_flood,
					lastReportSent: row.last_report_sent,
					reportFlood: row.g_report_flood,
				}
			: null;
	}

	async markEmailSent(userId: number, at: number): Promise<void> {
		await this.db.updateTable('users').set({ last_email_sent: at }).where('id', '=', userId).execute();
	}

	async markReportSent(userId: number, at: number): Promise<void> {
		await this.db.updateTable('users').set({ last_report_sent: at }).where('id', '=', userId).execute();
	}
}
