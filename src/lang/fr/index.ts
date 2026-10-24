/**
 * Point d'entrée des textes français, regroupés par page comme les fichiers lang/French/*.php.
 * Les vues reçoivent l'ensemble sous `lang` : `lang.common.index`, `lang.topic.quote`…
 */

import type { DateWords } from '../../services/dateFormat.ts';
import { common } from './common.ts';
import { forum } from './forum.ts';
import { indexPage } from './indexPage.ts';
import { pms } from './pms.ts';
import { profile } from './profile.ts';
import { topic } from './topic.ts';
import { userlist } from './userlist.ts';

export const fr = { common, index: indexPage, forum, topic, userlist, profile, pms };

export const frDateWords: DateWords = {
	today: "Aujourd'hui",
	yesterday: 'Hier',
	never: 'Jamais',
	days: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
	months: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
};

export type Lang = typeof fr;
