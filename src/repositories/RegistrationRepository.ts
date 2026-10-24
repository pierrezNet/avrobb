/**
 * Inscription (register.php) : contrôles qui interrogent la table users, puis création du compte.
 */

import type { Db } from '../db/database.ts';
import { GUEST_USER_ID } from '../domain/models.ts';

export interface NewUser {
	username: string;
	groupId: number;
	passwordHash: string;
	email: string;
	emailSetting: number;
	timezone: number;
	dst: boolean;
	language: string;
	style: string;
	registeredAt: number;
	ip: string;
}

export interface RegistrationStore {
	/** Un compte a-t-il été créé depuis cette adresse après `since` ? (anti-flood d'une heure) */
	hasRecentRegistration(ip: string, since: number): Promise<boolean>;
	/** Pseudo existant identique ou trop ressemblant (sans la ponctuation), insensible à la casse. */
	findSimilarUsername(username: string, skeleton: string): Promise<string | null>;
	/** Pseudos des comptes qui utilisent déjà cette adresse. */
	listUsernamesByEmail(email: string): Promise<string[]>;
	/** INSERT de register.php ; renvoie l'identifiant du nouveau membre. */
	createUser(user: NewUser): Promise<number>;
}

export class RegistrationRepository implements RegistrationStore {
	constructor(private readonly db: Db) {}

	async hasRecentRegistration(ip: string, since: number): Promise<boolean> {
		const row = await this.db
			.selectFrom('users')
			.select('id')
			.where('registration_ip', '=', ip)
			.where('registered', '>', since)
			.limit(1)
			.executeTakeFirst();
		return row !== undefined;
	}

	async findSimilarUsername(username: string, skeleton: string): Promise<string | null> {
		const row = await this.db
			.selectFrom('users')
			.select('username')
			.where((eb) =>
				eb.or([
					eb(eb.fn('upper', ['username']), '=', username.toUpperCase()),
					eb(eb.fn('upper', ['username']), '=', skeleton.toUpperCase()),
				]),
			)
			.where('id', '>', GUEST_USER_ID)
			.executeTakeFirst();
		return row?.username ?? null;
	}

	async listUsernamesByEmail(email: string): Promise<string[]> {
		const rows = await this.db.selectFrom('users').select('username').where('email', '=', email).execute();
		return rows.map((row) => row.username);
	}

	async createUser(user: NewUser): Promise<number> {
		const result = await this.db
			.insertInto('users')
			.values({
				username: user.username,
				group_id: user.groupId,
				password: user.passwordHash,
				email: user.email,
				email_setting: user.emailSetting,
				timezone: user.timezone,
				dst: user.dst ? 1 : 0,
				language: user.language,
				style: user.style,
				registered: user.registeredAt,
				registration_ip: user.ip,
				last_visit: user.registeredAt,
				title: null,
				realname: null,
				url: null,
				jabber: null,
				icq: null,
				msn: null,
				aim: null,
				yahoo: null,
				location: null,
				biographie: null,
				last_post: null,
				signature: null,
				disp_topics: null,
				disp_posts: null,
				admin_note: null,
				activate_string: null,
				activate_key: null,
				last_email_sent: null,
			})
			.executeTakeFirstOrThrow();
		return Number(result.insertId);
	}
}
