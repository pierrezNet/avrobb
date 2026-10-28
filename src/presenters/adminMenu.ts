/**
 * Menu de l'administration (generate_admin_menu() de include/common_admin.php) : modération,
 * administration (administrateurs), pages propres à PV comprises. Fonction pure.
 */

import type { BoardConfig, Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { isAdmin } from '../services/permissions.ts';
import type { MenuItem } from './profileEditPage.ts';

/**
 * Pages d'administration propres à PV, servies par admin_loader.php?plugin=… (mêmes URL que le PHP) :
 * AP_ pour les administrateurs, AMP_ aussi pour les modérateurs (forum_list_plugins()). AvroBB n'a
 * pas de système de plugins : elles figurent dans le menu comme les autres pages. Sondage, Mod
 * Installer, FluxToolBar, Plugile, Smilies et AP_Premium (promotion temporaire dans un groupe, table
 * premium jamais installée sur PV) ne font pas partie d'AvroBB.
 */
export const ADMIN_PLUGINS = ['AMP_Gestion_utilisateurs.php', 'AP_Balises.php', 'AP_Private_messaging.php', 'AP_Uploadile.php'] as const;

export type AdminPage =
	| 'index'
	| 'users'
	| 'bans'
	| 'reports'
	| 'options'
	| 'appearance'
	| 'permissions'
	| 'categories'
	| 'forums'
	| 'groups'
	| 'censoring'
	| 'maintenance'
	| (typeof ADMIN_PLUGINS)[number];

export interface AdminMenuView {
	moderator: MenuItem[];
	admin: MenuItem[] | null;
}

export function buildAdminMenu(viewer: Viewer, config: BoardConfig, active: AdminPage, lang: Lang): AdminMenuView {
	const t = lang.admin;
	const admin = isAdmin(viewer);
	const item = (page: AdminPage, href: string, label: string): MenuItem => ({ href, label, active: page === active });
	const plugin = (file: (typeof ADMIN_PLUGINS)[number], label: string) => item(file, `admin_loader.php?plugin=${file}`, label);
	const moderator = [
		item('index', 'admin_index.php', t.index),
		item('users', 'admin_users.php', t.users),
		...(admin || viewer.group.isModerator ? [plugin('AMP_Gestion_utilisateurs.php', t.addUser)] : []),
		...(admin || viewer.group.canModBanUsers ? [item('bans', 'admin_bans.php', t.bans)] : []),
		...(admin || config.reportsByBoard ? [item('reports', 'admin_reports.php', t.reports)] : []),
	];
	return {
		moderator,
		admin: admin
			? [
					item('options', 'admin_options.php', t.options),
					item('appearance', 'admin_appearance.php', t.appearance),
					item('permissions', 'admin_permissions.php', t.permissions),
					item('categories', 'admin_categories.php', t.categories),
					item('forums', 'admin_forums.php', t.forums),
					item('groups', 'admin_groups.php', t.userGroups),
					item('censoring', 'admin_censoring.php', t.censoring),
					plugin('AP_Balises.php', t.labels),
					plugin('AP_Private_messaging.php', t.privateMessages),
					plugin('AP_Uploadile.php', t.memberFiles),
					item('maintenance', 'admin_maintenance.php', t.maintenance),
				]
			: null,
	};
}
