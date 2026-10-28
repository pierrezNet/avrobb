/**
 * Bannissements de l'administration (admin_bans.php) : validation du formulaire avec les règles du
 * PHP (adresses et plages IP, e-mail ou domaine, expiration) et critères de recherche.
 */

import { isValidEmail } from './mail.ts';
import { punTrim } from './phpString.ts';
import { parseBanExpire } from './userActions.ts';
import { parseAdminDate } from './userSearch.ts';

export interface BanValues {
	username: string | null;
	/** Adresses ou plages séparées par des espaces. */
	ip: string | null;
	email: string | null;
	message: string | null;
	expire: number | null;
}

export type BanFormError = 'mustEnter' | 'guest' | 'invalidIp' | 'invalidEmail' | 'invalidDate';

/**
 * Adresses IP ou débuts d'adresse (plages), normalisées comme le PHP : zéros de tête retirés, au plus
 * 4 octets décimaux ou 8 groupes hexadécimaux. null si l'une est invalide.
 */
export function normalizeBanIps(value: string): string | null {
	const addresses = value
		.replace(/\s{2,}/g, ' ')
		.split(' ')
		.map((address) => punTrim(address));
	const normalized: string[] = [];
	for (const address of addresses) {
		if (address.includes(':')) {
			const groups = address.split(':').map((group) => group.replace(/^0+/, ''));
			if (
				groups.length > 8 ||
				groups.some((group) => (group !== '' && !/^[0-9a-f]+$/i.test(group)) || Number.parseInt(group || '0', 16) > 65535)
			)
				return null;
			normalized.push(groups.join(':'));
		} else {
			// Zéros de tête retirés, en gardant « 0 » (le ltrim() du PHP réduisait « 000 » à rien).
			const octets = address.split('.').map((octet) => octet.replace(/^0+(?=\d)/, ''));
			if (octets.length > 4 || octets.some((octet) => /[^0-9]/.test(octet) || Number(octet) > 255)) return null;
			normalized.push(octets.join('.'));
		}
	}
	return normalized.join(' ');
}

/** Lecture du formulaire (stage 2) ; `viewerOffset` : décalage horaire du lecteur en secondes. */
export function readBanForm(
	read: (name: string) => string,
	viewerOffset: number,
	now: number,
): { kind: 'ok'; ban: BanValues } | { kind: 'error'; error: BanFormError } {
	const username = punTrim(read('ban_user'));
	const ipInput = punTrim(read('ban_ip'));
	const email = punTrim(read('ban_email')).toLowerCase();
	const message = punTrim(read('ban_message'));
	if (username === '' && ipInput === '' && email === '') return { kind: 'error', error: 'mustEnter' };
	if (username.toLowerCase() === 'guest') return { kind: 'error', error: 'guest' };
	const ip = ipInput !== '' ? normalizeBanIps(ipInput) : '';
	if (ip === null) return { kind: 'error', error: 'invalidIp' };
	// Adresse complète, ou nom de domaine seul (tout un fournisseur).
	if (email !== '' && !isValidEmail(email) && !/^[a-z0-9-]+(\.[a-z0-9-]+)*(\.[a-z]{2,4})$/.test(email))
		return { kind: 'error', error: 'invalidEmail' };
	const expire = parseBanExpire(read('ban_expire'), viewerOffset, now);
	if (expire === 'invalid') return { kind: 'error', error: 'invalidDate' };
	return {
		kind: 'ok',
		ban: {
			username: username !== '' ? username : null,
			ip: ip !== '' ? ip : null,
			email: email !== '' ? email : null,
			message: message !== '' ? message : null,
			expire,
		},
	};
}

export const BAN_SEARCH_FIELDS = ['username', 'ip', 'email', 'message'] as const;
export const BAN_SEARCH_ORDERS = ['username', 'ip', 'email', 'expire'] as const;

export interface BanSearchCriteria {
	patterns: Partial<Record<(typeof BAN_SEARCH_FIELDS)[number], string>>;
	expireAfter: number | null;
	expireBefore: number | null;
	orderBy: (typeof BAN_SEARCH_ORDERS)[number];
	descending: boolean;
}

export function readBanSearch(
	read: (name: string) => string,
): { kind: 'ok'; criteria: BanSearchCriteria; queryString: string } | { kind: 'invalidDate' } {
	const query = new URLSearchParams({ find_ban: '' });
	const order = read('order_by');
	const orderBy = (BAN_SEARCH_ORDERS as readonly string[]).includes(order) ? (order as BanSearchCriteria['orderBy']) : 'username';
	const descending = read('direction') === 'DESC';
	query.set('order_by', orderBy);
	query.set('direction', descending ? 'DESC' : 'ASC');
	const date = (name: string): number | null | 'invalid' => {
		const value = read(name).trim();
		if (value === '') return null;
		query.set(name, value);
		return parseAdminDate(value) ?? 'invalid';
	};
	const expireAfter = date('expire_after');
	const expireBefore = date('expire_before');
	if (expireAfter === 'invalid' || expireBefore === 'invalid') return { kind: 'invalidDate' };
	const patterns: BanSearchCriteria['patterns'] = {};
	for (const name of BAN_SEARCH_FIELDS) {
		const value = read(`form[${name}]`).trim();
		if (value === '') continue;
		patterns[name] = value.replaceAll('*', '%');
		query.set(`form[${name}]`, value);
	}
	return { kind: 'ok', criteria: { patterns, expireAfter, expireBefore, orderBy, descending }, queryString: query.toString() };
}

/** Ajoute l'adresse de la case « dernière IP connue » aux adresses saisies, sans doublon. */
export function withLastIp(typed: string, lastIp: string): string {
	const ips = typed
		.trim()
		.split(/\s+/)
		.filter((ip) => ip !== '');
	const extra = lastIp.trim();
	return (extra !== '' && !ips.includes(extra) ? [...ips, extra] : ips).join(' ');
}
