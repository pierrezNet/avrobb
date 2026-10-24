/**
 * Mots de passe FluxBB : SHA-1 du mot de passe (pun_hash()), ou MD5 hérité de FluxBB 1.2 que la
 * connexion remplace par le SHA-1 (login.php). Le passage à argon2 n'est possible qu'une fois le
 * PHP arrêté (voir TODO, lot 8).
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { punHash } from './legacySession.ts';

export interface PasswordCheck {
	valid: boolean;
	/** Nouveau hash à enregistrer quand l'ancien était en MD5. */
	upgradeTo: string | null;
}

const sameHex = (a: string, b: string): boolean => {
	const left = Buffer.from(a.toLowerCase());
	const right = Buffer.from(b.toLowerCase());
	return left.length === right.length && timingSafeEqual(left, right);
};

/** @param password mot de passe saisi, déjà débarrassé des espaces de bord (pun_trim()) */
export function checkPassword(password: string, storedHash: string): PasswordCheck {
	if (storedHash === '') return { valid: false, upgradeTo: null };

	if (storedHash.length !== 40) {
		const valid = sameHex(createHash('md5').update(password).digest('hex'), storedHash);
		return { valid, upgradeTo: valid ? punHash(password) : null };
	}

	return { valid: sameHex(punHash(password), storedHash), upgradeTo: null };
}
