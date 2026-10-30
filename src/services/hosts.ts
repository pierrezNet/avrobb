/**
 * Adresses IP saisies ou lues en base (moderate.php?get_host=, admin_users.php?show_users=) :
 * reconnaissance d'une adresse IPv4 ou IPv6, à la place des expressions de moderate.php, et nom DNS
 * de la résolution inverse (PTR). Fonctions pures, sans node:net (indisponible dans un Worker).
 */

const IPV4_PART = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4 = new RegExp(`^${IPV4_PART}(?:\\.${IPV4_PART}){3}$`);

/** Groupes hexadécimaux d'une adresse IPv6 (8 groupes, « :: » développé), ou null si invalide. */
function ipv6Groups(value: string): number[] | null {
	let address = value;
	// IPv4 en fin d'adresse (::ffff:192.0.2.1) : réécrite en deux groupes hexadécimaux.
	const lastColon = address.lastIndexOf(':');
	const last = address.slice(lastColon + 1);
	if (last.includes('.')) {
		if (lastColon < 0 || !IPV4.test(last)) return null;
		const [a = 0, b = 0, c = 0, d = 0] = last.split('.').map(Number);
		address = `${address.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
	}
	const halves = address.split('::');
	if (halves.length > 2) return null;
	const parse = (part: string): number[] | null => {
		if (part === '') return [];
		const groups = part.split(':');
		if (groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return null;
		return groups.map((group) => Number.parseInt(group, 16));
	};
	const head = parse(halves[0] ?? '');
	const rest = halves.length === 2 ? parse(halves[1] ?? '') : [];
	if (head === null || rest === null) return null;
	const total = head.length + rest.length;
	if (halves.length === 2 ? total > 7 : total !== 8) return null;
	return [...head, ...new Array<number>(8 - total).fill(0), ...rest];
}

export function isIpAddress(value: string): boolean {
	return IPV4.test(value) || ipv6Groups(value) !== null;
}

/** Nom à interroger pour la résolution inverse (in-addr.arpa, ip6.arpa), ou null si `ip` est invalide. */
export function reverseDnsName(ip: string): string | null {
	if (IPV4.test(ip)) return `${ip.split('.').reverse().join('.')}.in-addr.arpa`;
	const groups = ipv6Groups(ip);
	if (groups === null) return null;
	const nibbles = groups.map((group) => group.toString(16).padStart(4, '0')).join('');
	return `${[...nibbles].reverse().join('.')}.ip6.arpa`;
}
