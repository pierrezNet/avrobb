/**
 * Compte Premium de PV (premium.php) : tables apremium, acodes15 et acodes365, sans préfixe.
 */

import type { Db } from '../db/database.ts';
import { inTransaction } from './transactions.ts';

export interface PremiumStore {
	/** Date d'expiration « AAAA-MM-JJ » du membre, ou null s'il n'a jamais été Premium. */
	findExpiration(userId: number): Promise<string | null>;
	/**
	 * Utilise un code libre de la table et fixe la nouvelle expiration, en une transaction ;
	 * faux si le code n'existe pas ou a déjà servi.
	 */
	redeemCode(userId: number, table: 'acodes15' | 'acodes365', code: string, expiration: string): Promise<boolean>;
}

/** Colonne DATE lue en chaîne ou en Date selon le pilote : ramenée à « AAAA-MM-JJ ». */
function toDay(value: string | Date): string {
	if (value instanceof Date) {
		const pad = (n: number): string => String(n).padStart(2, '0');
		return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
	}
	return value.slice(0, 10);
}

export class PremiumRepository implements PremiumStore {
	constructor(private readonly db: Db) {}

	async findExpiration(userId: number): Promise<string | null> {
		const row = await this.db.selectFrom('apremium').select('Expiration').where('ID_User', '=', userId).executeTakeFirst();
		return row !== undefined ? toDay(row.Expiration) : null;
	}

	redeemCode(userId: number, table: 'acodes15' | 'acodes365', code: string, expiration: string): Promise<boolean> {
		return inTransaction(this.db, async (trx) => {
			const used = await trx.updateTable(table).set({ Used: userId }).where('Code', '=', code).where('Used', '=', 0).executeTakeFirst();
			if (Number(used.numUpdatedRows) === 0) return false;
			await trx
				.insertInto('apremium')
				.values({ ID_User: userId, Expiration: expiration })
				.onDuplicateKeyUpdate({ Expiration: expiration })
				.execute();
			return true;
		});
	}
}
