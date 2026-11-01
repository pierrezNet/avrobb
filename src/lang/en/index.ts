/**
 * Point d'entrée des textes anglais (interface sous /en/), même forme que src/lang/fr/index.ts :
 * le type `Lang` garantit à la compilation qu'aucun texte ne manque.
 */

import type { DateWords } from '../../services/dateFormat.ts';
import type { Lang } from '../fr/index.ts';
import { account } from './account.ts';
import { admin } from './admin.ts';
import { adminAppearance } from './adminAppearance.ts';
import { adminBans } from './adminBans.ts';
import { adminCensoring } from './adminCensoring.ts';
import { adminForums } from './adminForums.ts';
import { adminGroups } from './adminGroups.ts';
import { adminMaintenance } from './adminMaintenance.ts';
import { adminOptions } from './adminOptions.ts';
import { adminPages } from './adminPages.ts';
import { adminPermissions } from './adminPermissions.ts';
import { adminPlugins } from './adminPlugins.ts';
import { adminUsers } from './adminUsers.ts';
import { appFeedback } from './appFeedback.ts';
import { common } from './common.ts';
import { deletePage } from './delete.ts';
import { drafts } from './drafts.ts';
import { forum } from './forum.ts';
import { gallery } from './gallery.ts';
import { help } from './help.ts';
import { indexPage } from './indexPage.ts';
import { login } from './login.ts';
import { misc } from './misc.ts';
import { moderate } from './moderate.ts';
import { pms } from './pms.ts';
import { post } from './post.ts';
import { profile } from './profile.ts';
import { reputation } from './reputation.ts';
import { search } from './search.ts';
import { staticPages } from './staticPages.ts';
import { toolbar } from './toolbar.ts';
import { topic } from './topic.ts';
import { userlist } from './userlist.ts';

export const en: Lang = {
	common,
	index: indexPage,
	forum,
	topic,
	userlist,
	profile,
	help,
	search,
	staticPages,
	gallery,
	login,
	misc,
	account,
	pms,
	post,
	toolbar,
	delete: deletePage,
	drafts,
	reputation,
	moderate,
	admin,
	adminBans,
	adminCensoring,
	adminForums,
	adminGroups,
	adminUsers,
	adminAppearance,
	adminPages,
	adminMaintenance,
	adminOptions,
	adminPlugins,
	adminPermissions,
	appFeedback,
};

export const enDateWords: DateWords = {
	today: 'Today',
	yesterday: 'Yesterday',
	never: 'Never',
	days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
	months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
