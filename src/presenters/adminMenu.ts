/**
 * Menu de l'administration (generate_admin_menu() de include/common_admin.php) : modération,
 * administration (administrateurs) et plugins. Fonction pure.
 */

import type { BoardConfig, Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { isAdmin } from '../services/permissions.ts';
import type { MenuItem } from './profileEditPage.ts';

/**
 * Plugins d'administration de PV : AP_ pour les administrateurs, AMP_ aussi pour les modérateurs
 * (forum_list_plugins()). Sondage (sans objet dans PV) et Mod Installer (il modifie les fichiers PHP)
 * ne font pas partie d'AvroBB.
 */
export const ADMIN_PLUGINS = [
	'AMP_Gestion_utilisateurs.php',
	'AP_Balises.php',
	'AP_FluxToolBar.php',
	'AP_Plugile.php',
	'AP_Premium.php',
	'AP_Private_messaging.php',
	'AP_Smilies.php',
	'AP_Uploadile.php',
] as const;

export type AdminPage =
	| 'index'
	| 'users'
	| 'bans'
	| 'reports'
	| 'options'
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
	plugins: MenuItem[];
}

/** Nom affiché d'un plugin : sans préfixe ni extension, soulignés en espaces. */
export function pluginLabel(file: string): string {
	return file
		.replace(/^AM?P_/, '')
		.replace(/\.php$/, '')
		.replaceAll('_', ' ');
}

export function buildAdminMenu(viewer: Viewer, config: BoardConfig, active: AdminPage, lang: Lang): AdminMenuView {
	const t = lang.admin;
	const admin = isAdmin(viewer);
	const item = (page: AdminPage, href: string, label: string): MenuItem => ({ href, label, active: page === active });
	const moderator = [
		item('index', 'admin_index.php', t.index),
		item('users', 'admin_users.php', t.users),
		...(admin || viewer.group.canModBanUsers ? [item('bans', 'admin_bans.php', t.bans)] : []),
		...(admin || config.reportsByBoard ? [item('reports', 'admin_reports.php', t.reports)] : []),
	];
	return {
		moderator,
		admin: admin
			? [
					item('options', 'admin_options.php', t.options),
					item('permissions', 'admin_permissions.php', t.permissions),
					item('categories', 'admin_categories.php', t.categories),
					item('forums', 'admin_forums.php', t.forums),
					item('groups', 'admin_groups.php', t.userGroups),
					item('censoring', 'admin_censoring.php', t.censoring),
					item('maintenance', 'admin_maintenance.php', t.maintenance),
				]
			: null,
		plugins: ADMIN_PLUGINS.filter((file) => admin || (file.startsWith('AMP_') && viewer.group.isModerator)).map((file) =>
			item(file, `admin_loader.php?plugin=${file}`, pluginLabel(file)),
		),
	};
}
