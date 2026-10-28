/**
 * Adresses IP saisies ou lues en base (moderate.php?get_host=, admin_users.php?show_users=) :
 * reconnaissance d'une adresse IPv4 ou IPv6, à la place des expressions de moderate.php.
 */

import { isIP } from 'node:net';

export function isIpAddress(value: string): boolean {
	return isIP(value) !== 0;
}
