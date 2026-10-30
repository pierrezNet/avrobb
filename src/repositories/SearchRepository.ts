/**
 * Requêtes de search.php : index de recherche (search_words / search_matches), recherches par
 * auteur, recherches rapides, chargement des résultats ; résultats mémorisés dans search_cache et
 * date de la dernière recherche (anti-flood). Les permissions par forum (forum_perms) sont
 * appliquées à chaque requête, comme en PHP.
 */

import { sql } from 'kysely';
import type { Db } from '../db/database.ts';
import type { SearchPost, SearchTopic } from '../domain/models.ts';
import type { ShowAs, SortBy, WordHit } from '../services/search.ts';
import { forumReadable } from './forumPermissions.ts';

/** Forums auxquels limiter la recherche ; null pour tous les forums lisibles. */
export type ForumScope = readonly number[] | null;

export interface SearchReader {
	/** Messages contenant un mot de l'index (motif LIKE, « * » déjà converti en « % »). */
	matchWord(pattern: string, searchIn: 0 | 1 | -1, groupId: number, scope: ForumScope, sortBy: SortBy, showAs: ShowAs): Promise<WordHit[]>;
	/** Messages des membres dont le pseudo correspond au motif LIKE, triés. */
	matchAuthor(pattern: string, groupId: number, scope: ForumScope, sortBy: SortBy, showAs: ShowAs, dir: 'ASC' | 'DESC'): Promise<WordHit[]>;
	/** Sujets d'une recherche rapide, du plus récent au plus ancien (messages pour show_user_posts). */
	quickSearch(query: QuickSearchQuery): Promise<number[]>;
	listTopics(ids: readonly number[], sortBy: SortBy, dir: 'ASC' | 'DESC'): Promise<SearchTopic[]>;
	listPosts(ids: readonly number[], sortBy: SortBy, dir: 'ASC' | 'DESC'): Promise<SearchPost[]>;
	findUsername(userId: number): Promise<string | null>;
	/** search_cache.search_data d'une recherche mémorisée, si elle appartient à `ident`. */
	findCachedSearch(searchId: number, ident: string): Promise<string | null>;
}

export interface SearchWriter {
	/** Date de la dernière recherche : users.last_search d'un membre, online.last_search d'un invité (IP). */
	recordSearch(searcher: { userId: number } | { ip: string }, at: number): Promise<void>;
	/**
	 * Mémorise une recherche pour `ident` (pseudo ou IP), après avoir supprimé celles des visiteurs
	 * qui ne sont plus dans la liste des présents, comme search.php.
	 */
	saveCachedSearch(searchId: number, ident: string, data: string): Promise<void>;
}

export type QuickSearchQuery =
	| { action: 'show_new'; groupId: number; since: number; forumId: number | null }
	| { action: 'show_recent'; groupId: number; since: number; forumId: number | null }
	| { action: 'show_replies' | 'show_user_posts' | 'show_user_topics' | 'show_subscriptions'; groupId: number; userId: number }
	| { action: 'show_unanswered'; groupId: number };

/** Colonne de tri de search.php selon sort_by et l'affichage. */
function sortColumn(sortBy: SortBy, showAs: ShowAs) {
	switch (sortBy) {
		case 1:
			return showAs === 'topics' ? ('t.poster' as const) : ('p.poster' as const);
		case 2:
			return 't.subject' as const;
		case 3:
			return 't.forum_id' as const;
		case 4:
			return 't.last_post' as const;
		default:
			return showAs === 'topics' ? ('t.last_post' as const) : ('p.posted' as const);
	}
}

/** Colonne de tri quand les résultats sont des sujets (affichage « discussions »). */
function topicSortColumn(sortBy: SortBy) {
	const column = sortColumn(sortBy, 'topics');
	return column === 'p.posted' || column === 'p.poster' ? 't.last_post' : column;
}

export class SearchRepository implements SearchReader, SearchWriter {
	constructor(private readonly db: Db) {}

	/** Messages et leurs sujets, avec permissions et limitation aux forums choisis. */
	#posts(groupId: number, scope: ForumScope) {
		let query = this.db
			.selectFrom('posts as p')
			.innerJoin('topics as t', 't.id', 'p.topic_id')
			.leftJoin('forum_perms as fp', (join) => join.onRef('fp.forum_id', '=', 't.forum_id').on('fp.group_id', '=', groupId))
			.where(forumReadable);
		if (scope !== null) query = scope.length > 0 ? query.where('t.forum_id', 'in', scope) : query.where(sql<boolean>`1 = 0`);
		return query;
	}

	async matchWord(
		pattern: string,
		searchIn: 0 | 1 | -1,
		groupId: number,
		scope: ForumScope,
		sortBy: SortBy,
		showAs: ShowAs,
	): Promise<WordHit[]> {
		let query = this.#posts(groupId, scope)
			.innerJoin('search_matches as m', 'm.post_id', 'p.id')
			.innerJoin('search_words as w', 'w.id', 'm.word_id')
			.select(['p.id as post_id', 'p.topic_id', `${sortColumn(sortBy, showAs)} as sort_value`])
			.where('w.word', 'like', pattern);
		// search_in : 1 = messages seulement (subject_match = 0), -1 = sujets seulement.
		if (searchIn !== 0) query = query.where('m.subject_match', '=', searchIn > 0 ? 0 : 1);

		const rows = await query.execute();
		return rows.map((row) => ({ postId: row.post_id, topicId: row.topic_id, sortValue: row.sort_value ?? '' }));
	}

	async matchAuthor(
		pattern: string,
		groupId: number,
		scope: ForumScope,
		sortBy: SortBy,
		showAs: ShowAs,
		dir: 'ASC' | 'DESC',
	): Promise<WordHit[]> {
		const column = sortColumn(sortBy, showAs);
		const rows = await this.#posts(groupId, scope)
			.select(['p.id as post_id', 'p.topic_id', `${column} as sort_value`])
			.where('p.poster_id', 'in', (eb) => eb.selectFrom('users').select('id').where('username', 'like', pattern))
			.orderBy(column, dir === 'DESC' ? 'desc' : 'asc')
			.execute();
		return rows.map((row) => ({ postId: row.post_id, topicId: row.topic_id, sortValue: row.sort_value ?? '' }));
	}

	async quickSearch(query: QuickSearchQuery): Promise<number[]> {
		if (query.action === 'show_user_posts') {
			const rows = await this.#posts(query.groupId, null)
				.select('p.id')
				.where('p.poster_id', '=', query.userId)
				.orderBy('p.posted', 'desc')
				.execute();
			return rows.map((row) => row.id);
		}

		let topics = this.db
			.selectFrom('topics as t')
			.leftJoin('forum_perms as fp', (join) => join.onRef('fp.forum_id', '=', 't.forum_id').on('fp.group_id', '=', query.groupId))
			.select('t.id')
			.where(forumReadable)
			.orderBy('t.last_post', 'desc');

		switch (query.action) {
			case 'show_new':
			case 'show_recent':
				topics = topics.where('t.last_post', '>', query.since).where('t.moved_to', 'is', null);
				if (query.forumId !== null) topics = topics.where('t.forum_id', '=', query.forumId);
				break;
			case 'show_replies':
				topics = topics.where((eb) =>
					eb.exists(eb.selectFrom('posts as p').select('p.id').whereRef('p.topic_id', '=', 't.id').where('p.poster_id', '=', query.userId)),
				);
				break;
			case 'show_user_topics':
				topics = topics.where((eb) =>
					eb.exists(
						eb.selectFrom('posts as p').select('p.id').whereRef('p.id', '=', 't.first_post_id').where('p.poster_id', '=', query.userId),
					),
				);
				break;
			case 'show_subscriptions':
				topics = topics.where((eb) =>
					eb.exists(
						eb
							.selectFrom('topic_subscriptions as s')
							.select('s.topic_id')
							.whereRef('s.topic_id', '=', 't.id')
							.where('s.user_id', '=', query.userId),
					),
				);
				break;
			case 'show_unanswered':
				topics = topics.where('t.num_replies', '=', 0).where('t.moved_to', 'is', null);
				break;
		}

		return (await topics.execute()).map((row) => row.id);
	}

	async listTopics(ids: readonly number[], sortBy: SortBy, dir: 'ASC' | 'DESC'): Promise<SearchTopic[]> {
		if (ids.length === 0) return [];
		const rows = await this.db
			.selectFrom('topics as t')
			.innerJoin('forums as f', 'f.id', 't.forum_id')
			.select([
				't.id',
				't.poster',
				't.subject',
				't.posted',
				't.last_post',
				't.last_post_id',
				't.last_poster',
				't.num_views',
				't.num_replies',
				't.closed',
				't.sticky',
				't.moved_to',
				't.forum_id',
				'f.forum_name',
			])
			.where('t.id', 'in', ids)
			.orderBy(topicSortColumn(sortBy), dir === 'DESC' ? 'desc' : 'asc')
			.execute();

		return rows.map((row) => ({
			id: row.id,
			poster: row.poster,
			subject: row.subject,
			posted: row.posted,
			lastPost: row.last_post > 0 ? { postedAt: row.last_post, postId: row.last_post_id ?? 0, poster: row.last_poster ?? '' } : null,
			numViews: row.num_views,
			numReplies: row.num_replies,
			closed: row.closed === 1,
			sticky: row.sticky === 1,
			movedTo: row.moved_to !== null && row.moved_to !== 0 ? row.moved_to : null,
			hasPosted: false,
			forumId: row.forum_id,
			forumName: row.forum_name,
		}));
	}

	async listPosts(ids: readonly number[], sortBy: SortBy, dir: 'ASC' | 'DESC'): Promise<SearchPost[]> {
		if (ids.length === 0) return [];
		const rows = await this.db
			.selectFrom('posts as p')
			.innerJoin('topics as t', 't.id', 'p.topic_id')
			.innerJoin('forums as f', 'f.id', 't.forum_id')
			.select([
				'p.id',
				'p.poster',
				'p.poster_id',
				'p.posted',
				'p.message',
				'p.hide_smilies',
				't.id as topic_id',
				't.subject',
				't.first_post_id',
				't.last_post',
				't.num_replies',
				't.forum_id',
				'f.forum_name',
			])
			.where('p.id', 'in', ids)
			.orderBy(sortColumn(sortBy, 'posts'), dir === 'DESC' ? 'desc' : 'asc')
			.execute();

		return rows.map((row) => ({
			id: row.id,
			poster: row.poster,
			posterId: row.poster_id,
			posted: row.posted,
			message: row.message ?? '',
			hideSmilies: row.hide_smilies === 1,
			topicId: row.topic_id,
			subject: row.subject,
			firstPostId: row.first_post_id,
			topicLastPost: row.last_post,
			numReplies: row.num_replies,
			forumId: row.forum_id,
			forumName: row.forum_name,
		}));
	}

	async findUsername(userId: number): Promise<string | null> {
		const row = await this.db.selectFrom('users').select('username').where('id', '=', userId).executeTakeFirst();
		return row?.username ?? null;
	}

	async recordSearch(searcher: { userId: number } | { ip: string }, at: number): Promise<void> {
		if ('userId' in searcher) await this.db.updateTable('users').set({ last_search: at }).where('id', '=', searcher.userId).execute();
		else await this.db.updateTable('online').set({ last_search: at }).where('ident', '=', searcher.ip).execute();
	}

	async saveCachedSearch(searchId: number, ident: string, data: string): Promise<void> {
		// Le PHP ne purge que si la liste des présents n'est pas vide.
		const online = await this.db.selectFrom('online').select('ident').limit(1).executeTakeFirst();
		await this.db.batch([
			...(online !== undefined
				? [this.db.deleteFrom('search_cache').where('ident', 'not in', (eb) => eb.selectFrom('online').select('ident'))]
				: []),
			this.db.insertInto('search_cache').values({ id: searchId, ident, search_data: data }),
		]);
	}

	async findCachedSearch(searchId: number, ident: string): Promise<string | null> {
		const row = await this.db
			.selectFrom('search_cache')
			.select('search_data')
			.where('id', '=', searchId)
			.where('ident', '=', ident)
			.executeTakeFirst();
		return row?.search_data ?? null;
	}
}
