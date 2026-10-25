/**
 * Point d'entrée des textes français, regroupés par page comme les fichiers lang/French/*.php.
 * Les vues reçoivent l'ensemble sous `lang` : `lang.common.index`, `lang.topic.quote`…
 */

import type { DateWords } from '../../services/dateFormat.ts';
import { common } from './common.ts';
import { deletePage } from './delete.ts';
import { drafts } from './drafts.ts';
import { forum } from './forum.ts';
import { gallery } from './gallery.ts';
import { help } from './help.ts';
import { indexPage } from './indexPage.ts';
import { login } from './login.ts';
import { misc } from './misc.ts';
import { pms } from './pms.ts';
import { post } from './post.ts';
import { premium } from './premium.ts';
import { profile } from './profile.ts';
import { register } from './register.ts';
import { reputation } from './reputation.ts';
import { search } from './search.ts';
import { toolbar } from './toolbar.ts';
import { topic } from './topic.ts';
import { userlist } from './userlist.ts';

export const fr = {
	common,
	index: indexPage,
	forum,
	topic,
	userlist,
	profile,
	help,
	search,
	gallery,
	login,
	misc,
	register,
	pms,
	post,
	toolbar,
	delete: deletePage,
	drafts,
	reputation,
	premium,
};

export const frDateWords: DateWords = {
	today: "Aujourd'hui",
	yesterday: 'Hier',
	never: 'Jamais',
	days: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
	months: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
};

export type Lang = typeof fr;
