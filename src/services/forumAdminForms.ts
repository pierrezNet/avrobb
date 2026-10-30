/**
 * Lecture des formulaires d'admin_categories.php et d'admin_forums.php : champs indexés par
 * identifiant (cat[<id>][name], position[<id>], read_forum_new[<groupe>]…), validés comme le PHP.
 */

import type { EffectivePermission } from './forumPermissions.ts';
import { punLinebreaks, punTrim } from './phpString.ts';

type Fields = Readonly<Record<string, string | readonly string[]>>;

const text = (fields: Fields, name: string): string => {
	const value = fields[name];
	return typeof value === 'string' ? value : '';
};

/** Identifiants présents dans les noms de champs `<prefix>[<id>]<suffix>`. */
function indexedIds(fields: Fields, prefix: string, suffix = ''): number[] {
	const ids: number[] = [];
	for (const name of Object.keys(fields)) {
		if (!name.startsWith(`${prefix}[`) || !name.endsWith(`]${suffix}`)) continue;
		const id = name.slice(prefix.length + 1, name.length - suffix.length - 1);
		if (/^[1-9]\d{0,9}$/.test(id)) ids.push(Number(id));
	}
	return ids;
}

/** Position : entier positif écrit en chiffres seulement (preg_match('%[^0-9]%') du PHP). */
function position(value: string): number | null {
	const trimmed = value.trim();
	return /^\d{1,9}$/.test(trimmed) ? Number(trimmed) : null;
}

export type CategoryUpdates =
	| { kind: 'ok'; categories: { id: number; name: string; position: number }[] }
	| { kind: 'error'; error: 'missingName' | 'notInteger' }
	| { kind: 'badRequest' };

/** Bouton « Mettre à jour » d'admin_categories.php. */
export function readCategoryUpdates(fields: Fields): CategoryUpdates {
	const ids = indexedIds(fields, 'cat', '[name]');
	if (ids.length === 0) return { kind: 'badRequest' };
	const categories = [];
	for (const id of ids) {
		const name = punTrim(text(fields, `cat[${id}][name]`));
		if (name === '') return { kind: 'error', error: 'missingName' };
		const order = position(punTrim(text(fields, `cat[${id}][order]`)));
		if (order === null) return { kind: 'error', error: 'notInteger' };
		categories.push({ id, name, position: order });
	}
	return { kind: 'ok', categories };
}

/** Bouton « Mettre à jour les positions » d'admin_forums.php ; null si une position est invalide. */
export function readForumPositions(fields: Fields): { id: number; position: number }[] | null {
	const positions = [];
	for (const id of indexedIds(fields, 'position')) {
		const value = position(text(fields, `position[${id}]`));
		if (value === null) return null;
		positions.push({ id, position: value });
	}
	return positions;
}

export type ForumDetailsForm =
	| {
			kind: 'ok';
			name: string;
			description: string | null;
			redirectUrl: string | null;
			siteUrl: string | null;
			repoUrl: string | null;
			sortBy: number;
			categoryId: number;
	  }
	| { kind: 'missingName' }
	| { kind: 'badLink' }
	| { kind: 'badRequest' };

/** Détails du forum (admin_forums.php?edit_forum=…) ; l'URL de redirection n'est envoyée que pour un forum vide. */
export function readForumDetails(fields: Fields): ForumDetailsForm {
	const name = punTrim(text(fields, 'forum_name'));
	const description = punLinebreaks(punTrim(text(fields, 'forum_desc')));
	const categoryId = Number.parseInt(text(fields, 'cat_id'), 10);
	const sortBy = Number.parseInt(text(fields, 'sort_by'), 10);
	const redirectUrl = punTrim(text(fields, 'redirect_url'));
	const siteUrl = projectLink(text(fields, 'site_url'));
	const repoUrl = projectLink(text(fields, 'repo_url'));
	if (name === '') return { kind: 'missingName' };
	if (!(categoryId >= 1) || ![0, 1, 2].includes(sortBy)) return { kind: 'badRequest' };
	if (siteUrl === undefined || repoUrl === undefined) return { kind: 'badLink' };
	return {
		kind: 'ok',
		name,
		description: description !== '' ? description : null,
		redirectUrl: redirectUrl !== '' ? redirectUrl : null,
		siteUrl,
		repoUrl,
		sortBy,
		categoryId,
	};
}

/**
 * Lien d'un forum de projet (AvroBB) : vide → null ; sinon une adresse http(s) absolue (« www. »
 * complété en https://), undefined si elle est refusée. Le lien est affiché à tous : aucun autre
 * schéma (javascript:, ftp:…), pas d'identifiants dans l'adresse.
 */
function projectLink(input: string): string | null | undefined {
	const value = punTrim(input);
	if (value === '') return null;
	const full = value.startsWith('www.') ? `https://${value}` : value;
	if (full.length > 255 || /\s/.test(full) || !URL.canParse(full)) return undefined;
	const url = new URL(full);
	const valid =
		(url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.') && url.username === '' && url.password === '';
	return valid ? full : undefined;
}

/** Valeurs d'un groupe : affichées à l'ouverture (*_old) et cochées à l'envoi (*_new) ; null si absentes. */
export function readGroupPermission(fields: Fields, groupId: number): { old: EffectivePermission; sent: EffectivePermission } | null {
	if (!(`read_forum_old[${groupId}]` in fields)) return null;
	const old = (name: string): boolean => text(fields, `${name}_old[${groupId}]`) === '1';
	const sent = (name: string): boolean => `${name}_new[${groupId}]` in fields;
	return {
		old: { readForum: old('read_forum'), postReplies: old('post_replies'), postTopics: old('post_topics') },
		sent: { readForum: sent('read_forum'), postReplies: sent('post_replies'), postTopics: sent('post_topics') },
	};
}
